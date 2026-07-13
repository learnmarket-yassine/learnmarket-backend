import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  JobRequestType,
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

  async create(tutorId: string, jobRequestId: string, dto: CreateProposalDto) {
    const jobRequest = await this.prisma.jobRequest.findUnique({
      where: { id: jobRequestId },
    });
    if (!jobRequest) throw new NotFoundException('Job request not found');

    let totalSessions: number;
    let lessons: { title: string; objective?: string }[];

    if (jobRequest.type === JobRequestType.COURSE) {
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
          jobRequestId,
          tutorId,
          totalSessions,
          sessionDurationMinutes: dto.sessionDurationMinutes,
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
      include: { ...PROPOSAL_INCLUDE, jobRequest: true },
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
      where: { jobRequest: { learnerId: viewer.id } },
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
      include: { jobRequest: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.jobRequest.learnerId !== learnerId) {
      throw new ForbiddenException('You do not own this job request');
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
    proposal: { tutorId: string; jobRequest: { learnerId: string } },
  ): void {
    const isTutor = proposal.tutorId === viewer.id;
    const isLearner = proposal.jobRequest.learnerId === viewer.id;
    if (!isTutor && !isLearner) {
      throw new ForbiddenException('You do not have access to this proposal');
    }
  }
}
