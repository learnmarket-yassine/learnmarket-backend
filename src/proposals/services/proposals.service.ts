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
  Proposal,
  ProposalSessionStatus,
  ProposalStatus,
  UserRole,
} from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProposalDto } from '../dto/create-proposal.dto';
import { UpdateProposalDto } from '../dto/update-proposal.dto';

const PROPOSAL_INCLUDE = { sessions: true } as const;

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

    let totalSessions: number;
    let lessons: { title: string; objective?: string }[];

    if (learnRequest.type === LearnRequestType.COURSE) {
      if (!dto.lessons || dto.lessons.length !== dto.totalSessions) {
        throw new BadRequestException(
          `COURSE proposals require exactly totalSessions (${dto.totalSessions}) lesson entries`,
        );
      }
      totalSessions = dto.totalSessions;
      lessons = dto.lessons;
    } else {
      totalSessions = 1;
      lessons = [
        {
          title: dto.lessons?.[0]?.title ?? 'Session',
          objective: dto.lessons?.[0]?.objective,
        },
      ];
    }

    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.create({
        data: {
          learnRequestId,
          tutorId,
          totalSessions,
          sessionDurationMinutes: dto.sessionDurationMinutes,
          totalPrice: dto.totalPrice,
          message: dto.message,
        },
      });

      await tx.proposalSession.createMany({
        data: lessons.map((lesson, index) => ({
          proposalId: proposal.id,
          sessionNumber: index + 1,
          title: lesson.title,
          objective: lesson.objective,
          status:
            index === 0
              ? ProposalSessionStatus.PENDING_SCHEDULE
              : ProposalSessionStatus.LOCKED,
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
    return this.prisma.proposal.update({
      where: { id },
      data: dto,
      include: PROPOSAL_INCLUDE,
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

    return this.prisma.proposal.update({
      where: { id: proposalId },
      data: { status: ProposalStatus.ACCEPTED },
      include: PROPOSAL_INCLUDE,
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
