import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LearnRequest,
  LearnRequestStatus,
  Prisma,
  ProposalStatus,
  SessionStatus,
  UserRole,
} from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { buildScopedWhere } from '../../common/filtering/scoped-where.util';
import { getFeeBreakdown } from '../../common/utils/fee.util';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../../categories/categories.service';
import { SkillsService } from '../../skills/skills.service';
import { SparksService } from '../../sparks/services/sparks.service';
import { CreateLearnRequestDraftDto } from '../dto/create-draft.dto';
import { UpdateLearnRequestDto } from '../dto/update-learn-request.dto';
import { GetLearnRequestsQueryDto } from '../dto/list-learn-requests-query.dto';
import { GetProposalsForRequestQueryDto } from '../dto/get-proposals-for-request-query.dto';
import { LearnRequestValidationService } from './learn-request-validation.service';

// Mirrors the frontend's ACTIONABLE_SESSION_STATUSES (learner-booking
// feature) -- sessions the learner still has something to do on. Used to
// decide whether a CLOSED learn request needs the learner's attention.
const SESSION_NEEDS_ACTION_STATUSES: SessionStatus[] = [
  SessionStatus.PENDING_SCHEDULE,
  SessionStatus.HELD,
  SessionStatus.CANCELLED,
];

const PROPOSAL_INCLUDE = {
  sessionPlans: { orderBy: { sessionNumber: 'asc' } },
  tutor: {
    select: {
      id: true,
      firstname: true,
      lastname: true,
      avatar: true,
      headline: true,
      country: true,
      bio: true,
      languages: true,
      tutorProfile: {
        select: {
          skills: { include: { skill: true } },
          videoIntroUrl: true,
          verificationStatus: true,
        },
      },
    },
  },
} satisfies Prisma.ProposalInclude;

export function buildListInclude(user: Pick<AuthUser, 'id' | 'role'>) {
  return {
    category: true,
    skills: { include: { skill: true } },
    proposals: {
      where: user.role === UserRole.TUTOR ? { tutorId: user.id } : undefined,
      orderBy: { createdAt: 'desc' },
      include: PROPOSAL_INCLUDE,
    },
    // Only a tutor can have saved anything; scoping to their own id turns
    // "did I save this" into a plain boolean below instead of leaking the
    // raw join-table rows to the frontend.
    savedBy:
      user.role === UserRole.TUTOR
        ? { where: { tutorId: user.id } }
        : undefined,
  } satisfies Prisma.LearnRequestInclude;
}

// Only the owning learner can have shortlisted anything on their own
// request; a tutor viewing their own proposal here has no reason to see
// shortlist state, so the include is skipped for them entirely rather than
// always resolving to false.
function buildProposalListInclude(user: Pick<AuthUser, 'id' | 'role'>) {
  return {
    ...PROPOSAL_INCLUDE,
    shortlistedBy:
      user.role === UserRole.LEARNER
        ? { where: { learnerId: user.id } }
        : undefined,
  } satisfies Prisma.ProposalInclude;
}

type ProposalWithShortlist = Prisma.ProposalGetPayload<{
  include: ReturnType<typeof buildProposalListInclude>;
}>;

function buildDetailInclude() {
  return {
    category: true,
    skills: { include: { skill: true } },
    // At most one -- accept() closes the request and declines every other
    // proposal, so ACCEPTED is unique per learn request. Powers the
    // booking step on the details page: the accepted proposal (and its
    // sessions) is scoped there, not the full proposals list.
    proposals: {
      where: { status: ProposalStatus.ACCEPTED },
      include: PROPOSAL_INCLUDE,
    },
  } satisfies Prisma.LearnRequestInclude;
}

export type LearnRequestWithRelations = Prisma.LearnRequestGetPayload<{
  include: ReturnType<typeof buildListInclude>;
}>;

@Injectable()
export class LearnRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly skills: SkillsService,
    private readonly validation: LearnRequestValidationService,
    private readonly sparksService: SparksService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async createDraft(learnerId: string, dto: CreateLearnRequestDraftDto) {
    const learner = await this.prisma.user.findUnique({
      where: { id: learnerId },
      select: { isBlocked: true },
    });
    if (learner?.isBlocked) {
      throw new ForbiddenException(
        'Your account has been blocked. Contact support for assistance.',
      );
    }

    return this.prisma.learnRequest.create({
      data: {
        learnerId,
        type: dto.type,
        title: dto.title,
      },
      include: buildDetailInclude(),
    });
  }

  async findMany(user: AuthUser, query: GetLearnRequestsQueryDto) {
    const baseWhere: Prisma.LearnRequestWhereInput =
      user.role === UserRole.ADMIN
        ? {}
        : user.role === UserRole.TUTOR
          ? { status: LearnRequestStatus.OPEN }
          : { learnerId: user.id }; // LEARNER: own requests, any status

    const narrowingWhere: Prisma.LearnRequestWhereInput = {};
    if (query.categoryId) narrowingWhere.categoryId = query.categoryId;
    if (query.type?.length) narrowingWhere.type = { in: query.type };
    if (query.search) {
      narrowingWhere.title = { contains: query.search, mode: 'insensitive' };
    }
    if (query.status?.length && user.role !== UserRole.TUTOR) {
      narrowingWhere.status = { in: query.status };
    }
    if (query.level?.length) narrowingWhere.level = { in: query.level };
    if (query.budgetMin !== undefined) {
      narrowingWhere.budgetMax = { gte: query.budgetMin };
    }
    if (query.budgetMax !== undefined) {
      narrowingWhere.budgetMin = { lte: query.budgetMax };
    }
    if (query.preferredLanguages?.length) {
      narrowingWhere.preferredLanguages = { hasSome: query.preferredLanguages };
    }
    if (query.requestedFrequency?.length) {
      narrowingWhere.requestedFrequency = { in: query.requestedFrequency };
    }
    if (query.actionNeeded) {
      narrowingWhere.OR = [
        {
          status: LearnRequestStatus.OPEN,
          proposals: { some: { status: ProposalStatus.PENDING } },
        },
        {
          status: LearnRequestStatus.CLOSED,
          proposals: {
            some: {
              sessions: {
                some: { status: { in: SESSION_NEEDS_ACTION_STATUSES } },
              },
            },
          },
        },
      ];
    }

    const where = buildScopedWhere(baseWhere, narrowingWhere);

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.learnRequest.findMany({
        where,
        skip: query.page * query.take,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: buildListInclude(user),
      }),
      this.prisma.learnRequest.count({ where }),
    ]);

    return {
      paginatedResult: await this.attachDerivedFields(items),
      totalCount,
    };
  }

  async attachDerivedFields(items: LearnRequestWithRelations[]) {
    const withActionNeeded = await this.attachActionNeeded(items);
    return withActionNeeded.map((item) => ({
      ...item,
      isSavedByMe: (item.savedBy?.length ?? 0) > 0,
    }));
  }

  async findOneDetail(viewer: AuthUser, id: string) {
    const learnRequest = await this.prisma.learnRequest.findUnique({
      where: { id },
      include: buildDetailInclude(),
    });
    if (!learnRequest) throw new NotFoundException('Learn request not found');

    const isOwner = learnRequest.learnerId === viewer.id;
    const isTutorViewable =
      viewer.role === UserRole.TUTOR &&
      learnRequest.status === LearnRequestStatus.OPEN;
    const isAdmin = viewer.role === UserRole.ADMIN;

    if (!isOwner && !isTutorViewable && !isAdmin) {
      throw new NotFoundException('Learn request not found');
    }
    const { serviceFeePercent } = await this.platformSettings.getSettings();
    return {
      ...learnRequest,
      proposals: learnRequest.proposals.map((proposal) => ({
        ...proposal,
        ...getFeeBreakdown(Number(proposal.totalPrice), serviceFeePercent),
      })),
    };
  }

  async findProposalsForRequest(
    user: AuthUser,
    learnRequestId: string,
    query: GetProposalsForRequestQueryDto,
  ) {
    const learnRequestWhere: Prisma.LearnRequestWhereInput =
      user.role === UserRole.ADMIN
        ? {}
        : user.role === UserRole.TUTOR
          ? { status: LearnRequestStatus.OPEN }
          : { learnerId: user.id };

    const learnRequest = await this.prisma.learnRequest.findFirst({
      where: { id: learnRequestId, ...learnRequestWhere },
    });
    if (!learnRequest) throw new NotFoundException('Learn request not found');

    const proposalWhere: Prisma.ProposalWhereInput = { learnRequestId };
    if (user.role === UserRole.TUTOR) proposalWhere.tutorId = user.id;
    if (query.search) {
      proposalWhere.OR = [
        {
          tutor: { firstname: { contains: query.search, mode: 'insensitive' } },
        },
        {
          tutor: { lastname: { contains: query.search, mode: 'insensitive' } },
        },
      ];
    }

    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.proposal.findMany({
        where: proposalWhere,
        skip: query.page * query.take,
        take: query.take,
        orderBy: { createdAt: 'desc' },
        include: buildProposalListInclude(user),
      }),
      this.prisma.proposal.count({ where: proposalWhere }),
    ]);

    return {
      paginatedResult: (items as ProposalWithShortlist[]).map(
        ({ shortlistedBy, ...item }) => ({
          ...item,
          isShortlisted: (shortlistedBy?.length ?? 0) > 0,
        }),
      ),
      totalCount,
    };
  }

  async update(learnerId: string, id: string, dto: UpdateLearnRequestDto) {
    const existing = await this.findOwnedOrThrow(learnerId, id);
    if (existing.status !== LearnRequestStatus.DRAFT) {
      throw new ConflictException(
        'Learn request can only be edited while it is a draft',
      );
    }

    const { skillIds, ...rest } = dto;
    if (rest.categoryId) await this.categories.assertActive(rest.categoryId);
    const uniqueSkillIds =
      skillIds === undefined
        ? undefined
        : skillIds.length
          ? await this.skills.assertAllActive(skillIds)
          : [];

    return this.prisma.$transaction(async (tx) => {
      if (uniqueSkillIds !== undefined) {
        await this.diffSkills(tx, id, uniqueSkillIds);
      }
      return tx.learnRequest.update({
        where: { id },
        data: rest,
        include: buildDetailInclude(),
      });
    });
  }

  async publish(learnerId: string, id: string) {
    const existing = await this.findOwnedOrThrow(learnerId, id);
    if (existing.status !== LearnRequestStatus.DRAFT) {
      throw new ConflictException(
        'Learn request must be a draft to be published',
      );
    }

    const detailed = await this.prisma.learnRequest.findUniqueOrThrow({
      where: { id },
      include: buildDetailInclude(),
    });
    this.validation.assertPublishable(detailed);

    return this.prisma.learnRequest.update({
      where: { id },
      data: { status: LearnRequestStatus.OPEN },
      include: buildDetailInclude(),
    });
  }

  async cancel(learnerId: string, id: string) {
    const existing = await this.findOwnedOrThrow(learnerId, id);
    if (existing.status !== LearnRequestStatus.OPEN) {
      throw new ConflictException('Only open learn requests can be cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      // Status-guarded updateMany, not a blind update -- same discipline as
      // the accept-transaction guards elsewhere in this codebase, so a
      // concurrent state change (e.g. a proposal getting accepted at the
      // same moment) can't leave this transaction cancelling a request that
      // no longer qualifies.
      const cancelled = await tx.learnRequest.updateMany({
        where: { id, status: LearnRequestStatus.OPEN },
        data: { status: LearnRequestStatus.CANCELLED },
      });
      if (cancelled.count === 0) {
        throw new ConflictException(
          'Only open learn requests can be cancelled',
        );
      }

      // A cancelled-before-review request is a loss through no fault of the
      // tutor's own proposal quality -- refund every still-PENDING
      // proposal's spent Sparks (unlike a learner declining a proposal,
      // which does not refund).
      const pendingProposals = await tx.proposal.findMany({
        where: { learnRequestId: id, status: ProposalStatus.PENDING },
        select: { id: true },
      });
      for (const proposal of pendingProposals) {
        await this.sparksService.refundSparksForProposal(tx, proposal.id);
      }

      return tx.learnRequest.findUniqueOrThrow({
        where: { id },
        include: buildDetailInclude(),
      });
    });
  }

  async remove(learnerId: string, id: string) {
    const existing = await this.findOwnedOrThrow(learnerId, id);
    if (existing.status !== LearnRequestStatus.DRAFT) {
      throw new ConflictException('Only draft learn requests can be deleted');
    }
    await this.prisma.learnRequest.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async attachActionNeeded(
    items: LearnRequestWithRelations[],
  ): Promise<(LearnRequestWithRelations & { actionNeeded: boolean })[]> {
    const openIds = items
      .filter((item) => item.status === LearnRequestStatus.OPEN)
      .map((item) => item.id);
    const closedIds = items
      .filter((item) => item.status === LearnRequestStatus.CLOSED)
      .map((item) => item.id);

    const pendingProposalsPromise: Promise<{ learnRequestId: string }[]> =
      openIds.length
        ? this.prisma.proposal.findMany({
            where: {
              learnRequestId: { in: openIds },
              status: ProposalStatus.PENDING,
            },
            select: { learnRequestId: true },
            distinct: ['learnRequestId'],
          })
        : Promise.resolve([]);

    const pendingSessionsPromise: Promise<
      { proposal: { learnRequestId: string } }[]
    > = closedIds.length
      ? this.prisma.session.findMany({
          where: {
            status: { in: SESSION_NEEDS_ACTION_STATUSES },
            proposal: { learnRequestId: { in: closedIds } },
          },
          select: { proposal: { select: { learnRequestId: true } } },
        })
      : Promise.resolve([]);

    const [pendingProposals, pendingSessions] = await Promise.all([
      pendingProposalsPromise,
      pendingSessionsPromise,
    ]);

    const actionNeededIds = new Set([
      ...pendingProposals.map((proposal) => proposal.learnRequestId),
      ...pendingSessions.map((session) => session.proposal.learnRequestId),
    ]);

    return items.map((item) => ({
      ...item,
      actionNeeded: actionNeededIds.has(item.id),
    }));
  }

  private async diffSkills(
    tx: Prisma.TransactionClient,
    learnRequestId: string,
    incomingSkillIds: string[],
  ) {
    const existingRows = await tx.learnRequestSkill.findMany({
      where: { learnRequestId },
      select: { skillId: true },
    });
    const existingIds = new Set(existingRows.map((row) => row.skillId));
    const incomingIds = new Set(incomingSkillIds);

    const toAdd = incomingSkillIds.filter((id) => !existingIds.has(id));
    const toRemove = [...existingIds].filter((id) => !incomingIds.has(id));

    if (toRemove.length) {
      await tx.learnRequestSkill.deleteMany({
        where: { learnRequestId, skillId: { in: toRemove } },
      });
    }
    if (toAdd.length) {
      await tx.learnRequestSkill.createMany({
        data: toAdd.map((skillId) => ({ learnRequestId, skillId })),
      });
    }
  }

  private async findOwnedOrThrow(
    learnerId: string,
    id: string,
  ): Promise<LearnRequest> {
    const learnRequest = await this.prisma.learnRequest.findFirst({
      where: { id, learnerId },
    });
    if (!learnRequest) throw new NotFoundException('Learn request not found');
    return learnRequest;
  }
}
