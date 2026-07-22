import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LearnRequestStatus,
  LearnRequestType,
  PayoutMethod,
  Proposal,
  ProposalStatus,
  SessionStatus,
  UserRole,
} from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProposalDto } from '../dto/create-proposal.dto';
import { UpdateProposalDto } from '../dto/update-proposal.dto';

const PROPOSAL_INCLUDE = { sessionPlans: true, sessions: true } as const;

@Injectable()
export class ProposalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tutorId: string,
    learnRequestId: string,
    dto: CreateProposalDto,
  ) {
    const learnRequest = await this.prisma.learnRequest.findUnique({
      where: { id: learnRequestId },
    });
    if (!learnRequest) throw new NotFoundException('Learn request not found');
    if (learnRequest.status !== LearnRequestStatus.OPEN) {
      throw new ConflictException('Learn request is not open for proposals');
    }

    if (
      learnRequest.type === LearnRequestType.ONE_TIME &&
      dto.sessionPlans.length !== 1
    ) {
      throw new BadRequestException(
        'ONE_TIME proposals require exactly one session plan entry',
      );
    }
    if (
      learnRequest.type === LearnRequestType.COURSE &&
      dto.sessionPlans.length < 1
    ) {
      throw new BadRequestException(
        'COURSE proposals require at least one session plan entry',
      );
    }

    const existing = await this.prisma.proposal.findFirst({
      where: {
        learnRequestId,
        tutorId,
        status: { in: [ProposalStatus.PENDING, ProposalStatus.ACCEPTED] },
      },
    });
    if (existing) {
      throw new ConflictException(
        'You already have a pending or accepted proposal on this learn request',
      );
    }

    // A single-session proposal is paid out only once it's done — there is
    // no meaningful "per session" split when there's only one session.
    const payoutMethod =
      dto.sessionPlans.length === 1
        ? PayoutMethod.ON_COMPLETION
        : (dto.payoutMethod ?? PayoutMethod.ON_COMPLETION);

    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.create({
        data: {
          learnRequestId,
          tutorId,
          sessionDurationMinutes: dto.sessionDurationMinutes,
          totalPrice: dto.totalPrice,
          payoutMethod,
          message: dto.message,
        },
      });

      await tx.proposalSession.createMany({
        data: dto.sessionPlans.map((plan, index) => ({
          proposalId: proposal.id,
          sessionNumber: index + 1,
          title: plan.title,
          objective: plan.objective,
        })),
      });

      return tx.proposal.findUniqueOrThrow({
        where: { id: proposal.id },
        include: PROPOSAL_INCLUDE,
      });
    });
  }

  async findOneForViewer(viewer: AuthUser, id: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: { ...PROPOSAL_INCLUDE, learnRequest: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    this.assertViewable(viewer, proposal);
    return proposal;
  }

  findAllForViewer(viewer: AuthUser) {
    if (viewer.role === UserRole.TUTOR) {
      return this.prisma.proposal.findMany({
        where: { tutorId: viewer.id },
        include: PROPOSAL_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.proposal.findMany({
      where: { learnRequest: { learnerId: viewer.id } },
      include: PROPOSAL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(tutorId: string, id: string, dto: UpdateProposalDto) {
    const proposal = await this.findOwnedByTutor(tutorId, id);
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new ConflictException('Only pending proposals can be edited');
    }

    const { sessionPlans } = dto;
    if (!sessionPlans) {
      return this.prisma.proposal.update({
        where: { id },
        data: { message: dto.message },
        include: PROPOSAL_INCLUDE,
      });
    }

    const learnRequest = await this.prisma.learnRequest.findUniqueOrThrow({
      where: { id: proposal.learnRequestId },
    });
    if (
      learnRequest.type === LearnRequestType.ONE_TIME &&
      sessionPlans.length !== 1
    ) {
      throw new BadRequestException(
        'ONE_TIME proposals require exactly one session plan entry',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.message !== undefined) {
        await tx.proposal.update({
          where: { id },
          data: { message: dto.message },
        });
      }
      await tx.proposalSession.deleteMany({ where: { proposalId: id } });
      await tx.proposalSession.createMany({
        data: sessionPlans.map((plan, index) => ({
          proposalId: id,
          sessionNumber: index + 1,
          title: plan.title,
          objective: plan.objective,
        })),
      });

      return tx.proposal.findUniqueOrThrow({
        where: { id },
        include: PROPOSAL_INCLUDE,
      });
    });
  }

  async remove(tutorId: string, id: string) {
    const proposal = await this.findOwnedByTutor(tutorId, id);
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new ConflictException('Only pending proposals can be withdrawn');
    }
    await this.prisma.proposal.delete({ where: { id } });
  }

  async accept(learnerId: string, proposalId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { learnRequest: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.learnRequest.learnerId !== learnerId) {
      throw new ForbiddenException('You do not own this learn request');
    }
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new ConflictException('Proposal is not pending');
    }
    if (proposal.learnRequest.status !== LearnRequestStatus.OPEN) {
      throw new ConflictException('Learn request is not open');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.proposal.update({
        where: { id: proposalId },
        data: { status: ProposalStatus.ACCEPTED },
      });

      await tx.learnRequest.update({
        where: { id: proposal.learnRequestId },
        data: { status: LearnRequestStatus.CLOSED },
      });

      await tx.proposal.updateMany({
        where: {
          learnRequestId: proposal.learnRequestId,
          id: { not: proposalId },
          status: ProposalStatus.PENDING,
        },
        data: { status: ProposalStatus.DECLINED },
      });

      const plans = await tx.proposalSession.findMany({
        where: { proposalId },
        orderBy: { sessionNumber: 'asc' },
      });

      await tx.session.createMany({
        data: plans.map((plan) => ({
          proposalId,
          sessionNumber: plan.sessionNumber,
          title: plan.title,
          objective: plan.objective,
          status:
            plan.sessionNumber === 1
              ? SessionStatus.PENDING_SCHEDULE
              : SessionStatus.LOCKED,
        })),
      });

      return tx.proposal.findUniqueOrThrow({
        where: { id: proposalId },
        include: PROPOSAL_INCLUDE,
      });
    });
  }

  private async findOwnedByTutor(
    tutorId: string,
    id: string,
  ): Promise<Proposal> {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id, tutorId },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    return proposal;
  }

  private assertViewable(
    viewer: AuthUser,
    proposal: { tutorId: string; learnRequest: { learnerId: string } },
  ): void {
    const isTutor = proposal.tutorId === viewer.id;
    const isLearner = proposal.learnRequest.learnerId === viewer.id;
    if (!isTutor && !isLearner) {
      throw new ForbiddenException('You do not have access to this proposal');
    }
  }
}
