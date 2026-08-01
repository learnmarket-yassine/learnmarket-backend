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
  Prisma,
  Proposal,
  ProposalStatus,
  SessionStatus,
  UserRole,
} from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { applyServiceFee, getFeeBreakdown } from '../../common/utils/fee.util';
import { MessagingService } from '../../messaging/services/messaging.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProposalDto } from '../dto/create-proposal.dto';
import {
  GetMyProposalsQueryDto,
  ProposalGroup,
} from '../dto/get-my-proposals-query.dto';
import { UpdateProposalDto } from '../dto/update-proposal.dto';

// sessions include their slotHold (if any) so a client can resume an
// in-progress HELD session (check status + expiresAt) without a separate
// endpoint. Explicit select (not a bare include) so the Session model's
// zoom* columns -- zoomStartUrl in particular carries a host-privilege
// token -- never ride along on this general-purpose payload. Meeting
// details are only ever served through SessionsService.getMeetingDetails.
const PROPOSAL_INCLUDE = {
  sessionPlans: true,
  sessions: {
    select: {
      id: true,
      proposalId: true,
      sessionNumber: true,
      title: true,
      objective: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      slotHold: true,
    },
  },
} as const;

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  private withFeeBreakdown<T extends { totalPrice: Prisma.Decimal }>(
    proposal: T,
  ): T & ReturnType<typeof getFeeBreakdown> {
    return { ...proposal, ...getFeeBreakdown(Number(proposal.totalPrice)) };
  }

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
          // dto.totalPrice is the tutor's asking price -- the fee is
          // applied here, server-side, to get the learner-facing total
          // that actually gets stored/charged. Never trust a client-sent
          // learner-facing number.
          totalPrice: applyServiceFee(dto.totalPrice),
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

      // Reactivates a previously-inactive conversation between this tutor
      // and learner, if one exists.
      await this.messaging.recomputeConversationActiveState(
        tx,
        tutorId,
        learnRequest.learnerId,
      );

      const created = await tx.proposal.findUniqueOrThrow({
        where: { id: proposal.id },
        include: PROPOSAL_INCLUDE,
      });
      return this.withFeeBreakdown(created);
    });
  }

  async findOneForViewer(viewer: AuthUser, id: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: {
        ...PROPOSAL_INCLUDE,
        learnRequest: {
          include: {
            category: true,
            learner: { select: { country: true, city: true } },
            skills: { include: { skill: true } },
          },
        },
      },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    this.assertViewable(viewer, proposal);
    return this.withFeeBreakdown(proposal);
  }

  async findAllForViewer(viewer: AuthUser) {
    const proposals =
      viewer.role === UserRole.TUTOR
        ? await this.prisma.proposal.findMany({
            where: { tutorId: viewer.id },
            include: PROPOSAL_INCLUDE,
            orderBy: { createdAt: 'desc' },
          })
        : await this.prisma.proposal.findMany({
            where: { learnRequest: { learnerId: viewer.id } },
            include: PROPOSAL_INCLUDE,
            orderBy: { createdAt: 'desc' },
          });
    return proposals.map((proposal) => this.withFeeBreakdown(proposal));
  }

  async findMyProposals(tutorId: string, query: GetMyProposalsQueryDto) {
    const where: Prisma.ProposalWhereInput = { tutorId };

    if (query.group === ProposalGroup.ACTIVE) {
      where.status = { in: [ProposalStatus.PENDING, ProposalStatus.ACCEPTED] };
    } else if (query.group === ProposalGroup.ARCHIVED) {
      where.status = {
        in: [ProposalStatus.DECLINED, ProposalStatus.WITHDRAWN],
      };
    }

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.proposal.findMany({
        where,
        skip: query.page * query.take,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: {
          learnRequest: {
            select: {
              id: true,
              title: true,
              category: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.proposal.count({ where }),
    ]);

    return {
      paginatedResult: items.map((item) => this.withFeeBreakdown(item)),
      totalCount,
    };
  }

  async update(tutorId: string, id: string, dto: UpdateProposalDto) {
    const proposal = await this.findOwnedByTutor(tutorId, id);
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new ConflictException('Only pending proposals can be edited');
    }

    const { sessionPlans } = dto;
    const scalarData: Prisma.ProposalUpdateInput = {};
    if (dto.message !== undefined) scalarData.message = dto.message;
    if (dto.sessionDurationMinutes !== undefined) {
      scalarData.sessionDurationMinutes = dto.sessionDurationMinutes;
    }
    if (dto.totalPrice !== undefined) {
      scalarData.totalPrice = applyServiceFee(dto.totalPrice);
    }
    if (dto.payoutMethod !== undefined) {
      scalarData.payoutMethod = dto.payoutMethod;
    }

    if (!sessionPlans) {
      const updated = await this.prisma.proposal.update({
        where: { id },
        data: scalarData,
        include: PROPOSAL_INCLUDE,
      });
      return this.withFeeBreakdown(updated);
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

    if (sessionPlans.length === 1) {
      scalarData.payoutMethod = PayoutMethod.ON_COMPLETION;
    }

    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(scalarData).length > 0) {
        await tx.proposal.update({ where: { id }, data: scalarData });
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

      const updated = await tx.proposal.findUniqueOrThrow({
        where: { id },
        include: PROPOSAL_INCLUDE,
      });
      return this.withFeeBreakdown(updated);
    });
  }

  async remove(tutorId: string, id: string) {
    const proposal = await this.findOwnedByTutor(tutorId, id);
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new ConflictException('Only pending proposals can be withdrawn');
    }
    await this.prisma.proposal.delete({ where: { id } });
  }

  async withdraw(tutorId: string, id: string) {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id, tutorId, status: ProposalStatus.PENDING },
      include: { learnRequest: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');

    return this.prisma.$transaction(async (tx) => {
      const withdrawn = await tx.proposal.update({
        where: { id },
        data: { status: ProposalStatus.WITHDRAWN },
        include: PROPOSAL_INCLUDE,
      });
      await this.messaging.recomputeConversationActiveState(
        tx,
        proposal.tutorId,
        proposal.learnRequest.learnerId,
      );
      return this.withFeeBreakdown(withdrawn);
    });
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
      // Conditional updates, not blind ones -- this is the actual
      // concurrency guard. Two accept() calls for two different PENDING
      // proposals on the same OPEN learn request can both pass the checks
      // above before either commits; without a WHERE-guarded write here,
      // both would succeed and the request would end up double-booked
      // (two tutors both ACCEPTED, both owed a payout). Whichever
      // transaction's conditional update loses the race affects 0 rows
      // and aborts cleanly instead of silently overwriting.
      const learnRequestClosed = await tx.learnRequest.updateMany({
        where: { id: proposal.learnRequestId, status: LearnRequestStatus.OPEN },
        data: { status: LearnRequestStatus.CLOSED },
      });
      if (learnRequestClosed.count === 0) {
        throw new ConflictException('Learn request is not open');
      }

      const proposalAccepted = await tx.proposal.updateMany({
        where: { id: proposalId, status: ProposalStatus.PENDING },
        data: { status: ProposalStatus.ACCEPTED },
      });
      if (proposalAccepted.count === 0) {
        throw new ConflictException('Proposal is not pending');
      }

      await tx.proposal.updateMany({
        where: {
          learnRequestId: proposal.learnRequestId,
          id: { not: proposalId },
          status: ProposalStatus.PENDING,
        },
        data: { status: ProposalStatus.DECLINED },
      });

      // Each auto-declined tutor may have just lost their only active
      // relationship with this learner -- recompute their conversation.
      // The winning tutor's conversation was already active and stays
      // active, so it's not touched here.
      const declinedProposals = await tx.proposal.findMany({
        where: {
          learnRequestId: proposal.learnRequestId,
          id: { not: proposalId },
          status: ProposalStatus.DECLINED,
        },
        select: { tutorId: true },
      });
      for (const declined of declinedProposals) {
        await this.messaging.recomputeConversationActiveState(
          tx,
          declined.tutorId,
          learnerId,
        );
      }

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

      const accepted = await tx.proposal.findUniqueOrThrow({
        where: { id: proposalId },
        include: PROPOSAL_INCLUDE,
      });
      return this.withFeeBreakdown(accepted);
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
    // 404, not 403 -- a viewer with no legitimate relationship to this
    // proposal has no reason to learn it exists at all.
    if (!isTutor && !isLearner) {
      throw new NotFoundException('Proposal not found');
    }
  }
}
