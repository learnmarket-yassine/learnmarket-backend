import {
  ConflictException,
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
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../../categories/categories.service';
import { SkillsService } from '../../skills/skills.service';
import { CreateLearnRequestDraftDto } from '../dto/create-draft.dto';
import { UpdateLearnRequestDto } from '../dto/update-learn-request.dto';
import { GetLearnRequestsQueryDto } from '../dto/list-learn-requests-query.dto';
import { LearnRequestValidationService } from './learn-request-validation.service';

const DETAIL_INCLUDE = {
  category: true,
  skills: { include: { skill: true } },
} as const;

type LearnRequestWithRelations = Prisma.LearnRequestGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

@Injectable()
export class LearnRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly skills: SkillsService,
    private readonly validation: LearnRequestValidationService,
  ) {}

  createDraft(learnerId: string, dto: CreateLearnRequestDraftDto) {
    return this.prisma.learnRequest.create({
      data: {
        learnerId,
        type: dto.type,
        title: dto.title,
      },
      include: DETAIL_INCLUDE,
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
    // A TUTOR's status param is silently dropped -- never applied, so
    // there is no code path where it can widen past OPEN.
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
                some: { status: SessionStatus.PENDING_SCHEDULE },
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
        include: DETAIL_INCLUDE,
      }),
      this.prisma.learnRequest.count({ where }),
    ]);

    return {
      paginatedResult: await this.attachActionNeeded(items),
      totalCount,
    };
  }

  async findOneDetail(viewer: AuthUser, id: string) {
    const learnRequest = await this.prisma.learnRequest.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
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
    return learnRequest;
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
        include: DETAIL_INCLUDE,
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
      include: DETAIL_INCLUDE,
    });
    this.validation.assertPublishable(detailed);

    return this.prisma.learnRequest.update({
      where: { id },
      data: { status: LearnRequestStatus.OPEN },
      include: DETAIL_INCLUDE,
    });
  }

  async cancel(learnerId: string, id: string) {
    const existing = await this.findOwnedOrThrow(learnerId, id);
    if (existing.status !== LearnRequestStatus.OPEN) {
      throw new ConflictException('Only open learn requests can be cancelled');
    }
    return this.prisma.learnRequest.update({
      where: { id },
      data: { status: LearnRequestStatus.CANCELLED },
      include: DETAIL_INCLUDE,
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
            status: SessionStatus.PENDING_SCHEDULE,
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
