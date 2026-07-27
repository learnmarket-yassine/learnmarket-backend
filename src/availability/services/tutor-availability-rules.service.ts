import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TutorAvailabilityRule } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRuleDto } from '../dto/rules/create-rule.dto';
import { UpdateRuleDto } from '../dto/rules/update-rule.dto';
import { UpdateRulesDiffDto } from '../dto/rules/update-rules-diff.dto';
import { AvailabilityGuardService } from './availability-guard.service';

@Injectable()
export class TutorAvailabilityRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: AvailabilityGuardService,
  ) {}

  create(tutorId: string, dto: CreateRuleDto) {
    this.validateTimeRange(dto.startTime, dto.endTime);
    return this.prisma.tutorAvailabilityRule.create({
      data: { tutorId, ...dto },
    });
  }

  findAll(tutorId: string) {
    return this.prisma.tutorAvailabilityRule.findMany({
      where: { tutorId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async update(tutorId: string, id: string, dto: UpdateRuleDto) {
    const existing = await this.findOwned(tutorId, id);
    await this.guardUpdate(tutorId, existing, dto);

    return this.prisma.tutorAvailabilityRule.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tutorId: string, id: string) {
    const existing = await this.findOwned(tutorId, id);
    await this.guard.assertRuleChangeSafe(tutorId, existing, null);
    await this.prisma.tutorAvailabilityRule.delete({ where: { id } });
  }

  /**
   * Applies a create/update/delete diff for a tutor's whole weekly schedule
   * as a single all-or-nothing transaction -- either every operation lands,
   * or none do. Ownership is enforced by scoping every read/write to
   * `tutorId`; each update/delete still runs the same booking-conflict
   * guard as the single-rule endpoints before it's applied.
   *
   * Delete -> update -> create order is deliberate but not load-bearing:
   * the only DB constraint on this table (`rule_time_order`, end > start)
   * is per-row, and there's no uniqueness/overlap constraint between rows,
   * so no operation order is required to satisfy a DB constraint. Deletes
   * are ordered first anyway so a day being fully replaced (old slot
   * deleted, new one created) can't transiently look weird mid-transaction.
   */
  async applyDiff(tutorId: string, dto: UpdateRulesDiffDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.toDelete.length > 0) {
        const existingToDelete = await tx.tutorAvailabilityRule.findMany({
          where: { id: { in: dto.toDelete }, tutorId },
        });
        if (existingToDelete.length !== dto.toDelete.length) {
          throw new ForbiddenException('One or more rules do not belong to you');
        }
        for (const rule of existingToDelete) {
          await this.guard.assertRuleChangeSafe(tutorId, rule, null);
        }
        await tx.tutorAvailabilityRule.deleteMany({
          where: { id: { in: dto.toDelete }, tutorId },
        });
      }

      for (const { id, input } of dto.toUpdate) {
        const existing = await tx.tutorAvailabilityRule.findFirst({
          where: { id, tutorId },
        });
        if (!existing) {
          throw new NotFoundException(`Rule ${id} not found or not yours`);
        }
        await this.guardUpdate(tutorId, existing, input);
        await tx.tutorAvailabilityRule.update({ where: { id }, data: input });
      }

      if (dto.toCreate.length > 0) {
        for (const input of dto.toCreate) {
          this.validateTimeRange(input.startTime, input.endTime);
        }
        await tx.tutorAvailabilityRule.createMany({
          data: dto.toCreate.map((input) => ({ ...input, tutorId })),
        });
      }

      return tx.tutorAvailabilityRule.findMany({
        where: { tutorId },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
    });
  }

  private async findOwned(
    tutorId: string,
    id: string,
  ): Promise<TutorAvailabilityRule> {
    const rule = await this.prisma.tutorAvailabilityRule.findFirst({
      where: { id, tutorId },
    });
    if (!rule) throw new NotFoundException('Availability rule not found');
    return rule;
  }

  /** Shared by the single-rule PATCH and the bulk diff: validates the
   * merged time range, then runs the booking-conflict guard against
   * whatever actually changed (day/timezone/active flag vs. just the
   * time window). */
  private async guardUpdate(
    tutorId: string,
    existing: TutorAvailabilityRule,
    dto: UpdateRuleDto,
  ): Promise<void> {
    const merged = { ...existing, ...dto };
    this.validateTimeRange(merged.startTime, merged.endTime);

    const dayOrTimezoneChanged =
      (dto.dayOfWeek !== undefined && dto.dayOfWeek !== existing.dayOfWeek) ||
      (dto.timezone !== undefined && dto.timezone !== existing.timezone);
    const becameInactive = dto.isActive === false && existing.isActive;
    const windowChanged =
      dto.startTime !== undefined || dto.endTime !== undefined;

    if (dayOrTimezoneChanged || becameInactive) {
      await this.guard.assertRuleChangeSafe(tutorId, existing, null);
    } else if (windowChanged) {
      await this.guard.assertRuleChangeSafe(tutorId, existing, {
        startTime: merged.startTime,
        endTime: merged.endTime,
      });
    }
  }

  private validateTimeRange(startTime: number, endTime: number): void {
    if (endTime <= startTime) {
      throw new BadRequestException('endTime must be greater than startTime');
    }
  }
}
