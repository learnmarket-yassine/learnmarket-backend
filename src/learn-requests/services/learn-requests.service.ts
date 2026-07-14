import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LearnRequest,
  LearnRequestStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../../categories/categories.service';
import { SkillsService } from '../../skills/skills.service';
import { CreateLearnRequestDto } from '../dto/create-learn-request.dto';
import { UpdateLearnRequestDto } from '../dto/update-learn-request.dto';
import { ListLearnRequestsQueryDto } from '../dto/list-learn-requests-query.dto';
import { AdminListLearnRequestsQueryDto } from '../dto/admin-list-learn-requests-query.dto';

const DETAIL_INCLUDE = {
  category: true,
  skills: { include: { skill: true } },
} as const;

// PATCH is allowed while DRAFT/REJECTED (plain edit) or OPEN (edit + reset to review).
const EDITABLE_STATUSES = new Set<LearnRequestStatus>([
  LearnRequestStatus.DRAFT,
  LearnRequestStatus.REJECTED,
  LearnRequestStatus.OPEN,
]);

const SUBMITTABLE_STATUSES = new Set<LearnRequestStatus>([
  LearnRequestStatus.DRAFT,
  LearnRequestStatus.REJECTED,
]);

@Injectable()
export class LearnRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly skills: SkillsService,
  ) {}

  async createDraft(learnerId: string, dto: CreateLearnRequestDto) {
    const { skillIds, ...rest } = dto;
    if (rest.categoryId) await this.categories.assertActive(rest.categoryId);
    const uniqueSkillIds = skillIds?.length
      ? await this.skills.assertAllActive(skillIds)
      : [];

    return this.prisma.learnRequest.create({
      data: {
        learnerId,
        ...rest,
        skills: uniqueSkillIds.length
          ? { create: uniqueSkillIds.map((skillId) => ({ skillId })) }
          : undefined,
      },
      include: DETAIL_INCLUDE,
    });
  }

  findMine(learnerId: string) {
    return this.prisma.learnRequest.findMany({
      where: { learnerId },
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findOpenFeed(query: ListLearnRequestsQueryDto) {
    return this.prisma.learnRequest.findMany({
      where: {
        status: LearnRequestStatus.OPEN,
        categoryId: query.categoryId,
        type: query.type,
      },
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
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
    if (!EDITABLE_STATUSES.has(existing.status)) {
      throw new ConflictException(
        'Learn request cannot be edited in its current status',
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

    const wasOpen = existing.status === LearnRequestStatus.OPEN;

    return this.prisma.$transaction(async (tx) => {
      if (uniqueSkillIds !== undefined) {
        await this.diffSkills(tx, id, uniqueSkillIds);
      }
      return tx.learnRequest.update({
        where: { id },
        data: {
          ...rest,
          ...(wasOpen
            ? {
                status: LearnRequestStatus.PENDING_REVIEW,
                reviewedAt: null,
                rejectionReason: null,
              }
            : {}),
        },
        include: DETAIL_INCLUDE,
      });
    });
  }

  async submit(learnerId: string, id: string) {
    const existing = await this.findOwnedOrThrow(learnerId, id);
    if (!SUBMITTABLE_STATUSES.has(existing.status)) {
      throw new ConflictException(
        'Learn request must be a draft or rejected to be submitted',
      );
    }

    const errors = this.collectSubmitErrors(existing);
    if (errors.length) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: errors,
      });
    }

    return this.prisma.learnRequest.update({
      where: { id },
      data: {
        status: LearnRequestStatus.PENDING_REVIEW,
        reviewedAt: null,
        rejectionReason: null,
      },
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
  // Admin
  // ---------------------------------------------------------------------

  findAllForAdmin(query: AdminListLearnRequestsQueryDto) {
    return this.prisma.learnRequest.findMany({
      where: { status: query.status },
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(id: string) {
    const { count } = await this.prisma.learnRequest.updateMany({
      where: { id, status: LearnRequestStatus.PENDING_REVIEW },
      data: { status: LearnRequestStatus.OPEN, reviewedAt: new Date() },
    });
    if (count === 0) await this.assertReviewConflictReason(id);

    return this.prisma.learnRequest.findUniqueOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });
  }

  async reject(id: string, reason: string) {
    const { count } = await this.prisma.learnRequest.updateMany({
      where: { id, status: LearnRequestStatus.PENDING_REVIEW },
      data: {
        status: LearnRequestStatus.REJECTED,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
    if (count === 0) await this.assertReviewConflictReason(id);

    return this.prisma.learnRequest.findUniqueOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

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

  private collectSubmitErrors(learnRequest: LearnRequest): string[] {
    const errors: string[] = [];
    if (!learnRequest.title?.trim()) errors.push('title is required');
    if (!learnRequest.type) errors.push('type is required');
    if (!learnRequest.categoryId) errors.push('categoryId is required');
    if (
      learnRequest.budgetMin != null &&
      learnRequest.budgetMax != null &&
      Number(learnRequest.budgetMax) < Number(learnRequest.budgetMin)
    ) {
      errors.push('budgetMax must be greater than or equal to budgetMin');
    }
    if (learnRequest.preferredLanguages?.some((lang) => !lang?.trim())) {
      errors.push('preferredLanguages entries must not be empty');
    }
    return errors;
  }

  // Distinguishes "not found" (404) from "found but not pending review" (409)
  // for the admin approve/reject optimistic-concurrency guard.
  private async assertReviewConflictReason(id: string): Promise<never> {
    const exists = await this.prisma.learnRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Learn request not found');
    throw new ConflictException('Learn request is not pending review');
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
