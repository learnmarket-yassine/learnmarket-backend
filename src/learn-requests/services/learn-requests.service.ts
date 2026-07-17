import {
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
import { CreateLearnRequestDraftDto } from '../dto/create-draft.dto';
import { UpdateLearnRequestDto } from '../dto/update-learn-request.dto';
import { ListLearnRequestsQueryDto } from '../dto/list-learn-requests-query.dto';
import { AdminListLearnRequestsQueryDto } from '../dto/admin-list-learn-requests-query.dto';
import { LearnRequestValidationService } from './learn-request-validation.service';

const DETAIL_INCLUDE = {
  category: true,
  skills: { include: { skill: true } },
} as const;

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
  // Admin
  // ---------------------------------------------------------------------

  findAllForAdmin(query: AdminListLearnRequestsQueryDto) {
    return this.prisma.learnRequest.findMany({
      where: { status: query.status },
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'asc' },
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
