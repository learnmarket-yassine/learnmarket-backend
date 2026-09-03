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
  NotificationType,
  PayoutMethod,
  Prisma,
  Proposal,
  ProposalStatus,
  SessionStatus,
  TutorVerificationStatus,
  UserRole,
} from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  applyServiceFee,
  FeeBreakdown,
  getFeeBreakdown,
} from '../../common/utils/fee.util';
import { MessagingService } from '../../messaging/services/messaging.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SparksService } from '../../sparks/services/sparks.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { CreateProposalDto } from '../dto/create-proposal.dto';
import {
  GetMyProposalsQueryDto,
  ProposalGroup,
} from '../dto/get-my-proposals-query.dto';
import { UpdateProposalDto } from '../dto/update-proposal.dto';

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
    private readonly sparksService: SparksService,
    private readonly notifications: NotificationsService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  private async withFeeBreakdown<T extends { totalPrice: Prisma.Decimal }>(
    proposal: T,
  ): Promise<T & FeeBreakdown> {
    const { serviceFeePercent } = await this.platformSettings.getSettings();
    return {
      ...proposal,
      ...getFeeBreakdown(Number(proposal.totalPrice), serviceFeePercent),
    };
  }

  async create(
    tutorId: string,
    learnRequestId: string,
    dto: CreateProposalDto,
  ) {
    const tutor = await this.prisma.user.findUnique({
      where: { id: tutorId },
      select: { isBlocked: true, tutorProfile: true },
    });
    if (tutor?.isBlocked) {
      throw new ForbiddenException(
        'Your account has been blocked. Contact support for assistance.',
      );
    }
    if (
      tutor?.tutorProfile?.verificationStatus !==
      TutorVerificationStatus.APPROVED
    ) {
      throw new ForbiddenException(
        'Complete verification before creating proposals. Visit your profile to submit for review.',
      );
    }

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
    const { serviceFeePercent } = await this.platformSettings.getSettings();

    const created = await this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.create({
        data: {
          learnRequestId,
          tutorId,
          sessionDurationMinutes: dto.sessionDurationMinutes,
          totalPrice: applyServiceFee(dto.totalPrice, serviceFeePercent),
          payoutMethod,
          message: dto.message,
        },
      });
      await this.sparksService.spendSparksForProposal(tx, tutorId, proposal.id);

      await tx.proposalSession.createMany({
        data: dto.sessionPlans.map((plan, index) => ({
          proposalId: proposal.id,
          sessionNumber: index + 1,
          title: plan.title,
          objective: plan.objective,
        })),
      });
      await this.messaging.recomputeConversationActiveState(
        tx,
        tutorId,
        learnRequest.learnerId,
      );

      const created = await tx.proposal.findUniqueOrThrow({
        where: { id: proposal.id },
        include: PROPOSAL_INCLUDE,
      });
      return {
        ...created,
        ...getFeeBreakdown(Number(created.totalPrice), serviceFeePercent),
      };
    });

    await this.notifications.create(
      learnRequest.learnerId,
      NotificationType.PROPOSAL_RECEIVED,
      'New proposal received',
      'You received a new proposal on your learn request.',
      { proposalId: created.id, learnRequestId },
    );

    return created;
  }

  async findOneForViewer(viewer: AuthUser, id: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: {
        ...PROPOSAL_INCLUDE,
        learnRequest: {
          include: {
            category: true,
            learner: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                country: true,
                city: true,
              },
            },
            skills: { include: { skill: true } },
          },
        },
      },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    this.assertViewable(viewer, proposal);
    return await this.withFeeBreakdown(proposal);
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
    const { serviceFeePercent } = await this.platformSettings.getSettings();
    return proposals.map((proposal) => ({
      ...proposal,
      ...getFeeBreakdown(Number(proposal.totalPrice), serviceFeePercent),
    }));
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

    const { serviceFeePercent } = await this.platformSettings.getSettings();
    return {
      paginatedResult: items.map((item) => ({
        ...item,
        ...getFeeBreakdown(Number(item.totalPrice), serviceFeePercent),
      })),
      totalCount,
    };
  }

  async update(tutorId: string, id: string, dto: UpdateProposalDto) {
    const proposal = await this.findOwnedByTutor(tutorId, id);
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new ConflictException('Only pending proposals can be edited');
    }

    const { sessionPlans } = dto;
    const { serviceFeePercent } = await this.platformSettings.getSettings();
    const scalarData: Prisma.ProposalUpdateInput = {};
    if (dto.message !== undefined) scalarData.message = dto.message;
    if (dto.sessionDurationMinutes !== undefined) {
      scalarData.sessionDurationMinutes = dto.sessionDurationMinutes;
    }
    if (dto.totalPrice !== undefined) {
      scalarData.totalPrice = applyServiceFee(
        dto.totalPrice,
        serviceFeePercent,
      );
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
      return {
        ...updated,
        ...getFeeBreakdown(Number(updated.totalPrice), serviceFeePercent),
      };
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
      return {
        ...updated,
        ...getFeeBreakdown(Number(updated.totalPrice), serviceFeePercent),
      };
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
    const { serviceFeePercent } = await this.platformSettings.getSettings();

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
      return {
        ...withdrawn,
        ...getFeeBreakdown(Number(withdrawn.totalPrice), serviceFeePercent),
      };
    });
  }
  async runAcceptTransaction(
    tx: Prisma.TransactionClient,
    proposalId: string,
  ): Promise<void> {
    const proposal = await tx.proposal.findUniqueOrThrow({
      where: { id: proposalId },
      include: { learnRequest: true },
    });
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
        proposal.learnRequest.learnerId,
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
    if (!isTutor && !isLearner && viewer.role !== 'ADMIN') {
      throw new NotFoundException('Proposal not found');
    }
  }
}
