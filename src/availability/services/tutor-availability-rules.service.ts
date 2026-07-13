import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TutorAvailabilityRule } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRuleDto } from '../dto/rules/create-rule.dto';
import { UpdateRuleDto } from '../dto/rules/update-rule.dto';
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

  private validateTimeRange(startTime: number, endTime: number): void {
    if (endTime <= startTime) {
      throw new BadRequestException('endTime must be greater than startTime');
    }
  }
}
