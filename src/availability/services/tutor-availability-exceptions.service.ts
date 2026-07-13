import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExceptionType, TutorAvailabilityException } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  toDateOnlyString,
  zonedTimeToUtc,
} from '../../common/utils/timezone.util';
import { CreateExceptionDto } from '../dto/exceptions/create-exception.dto';
import { UpdateExceptionDto } from '../dto/exceptions/update-exception.dto';
import { Interval, subtract } from '../utils/interval.util';
import { AvailabilityGuardService } from './availability-guard.service';

@Injectable()
export class TutorAvailabilityExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: AvailabilityGuardService,
  ) {}

  async create(tutorId: string, dto: CreateExceptionDto) {
    this.validateTimeRange(dto.startTime, dto.endTime);

    if (dto.type === ExceptionType.BLOCKED) {
      const window = this.exceptionWindow(
        dto.date,
        dto.startTime,
        dto.endTime,
        dto.timezone,
      );
      await this.guard.assertWindowsSafe(tutorId, [window]);
    }

    return this.prisma.tutorAvailabilityException.create({
      data: { ...dto, tutorId, date: new Date(dto.date) },
    });
  }

  findAll(tutorId: string) {
    return this.prisma.tutorAvailabilityException.findMany({
      where: { tutorId },
      orderBy: { date: 'asc' },
    });
  }

  async update(tutorId: string, id: string, dto: UpdateExceptionDto) {
    const existing = await this.findOwned(tutorId, id);
    const merged = {
      date: dto.date ? new Date(dto.date) : existing.date,
      type: dto.type ?? existing.type,
      startTime:
        dto.startTime !== undefined ? dto.startTime : existing.startTime,
      endTime: dto.endTime !== undefined ? dto.endTime : existing.endTime,
      timezone: dto.timezone ?? existing.timezone,
    };
    this.validateTimeRange(merged.startTime, merged.endTime);

    if (merged.type === ExceptionType.BLOCKED) {
      const window = this.exceptionWindow(
        toDateOnlyString(merged.date),
        merged.startTime,
        merged.endTime,
        merged.timezone,
      );
      await this.guard.assertWindowsSafe(tutorId, [window]);
    }

    if (existing.type === ExceptionType.ADDED) {
      const oldWindow = this.exceptionWindow(
        toDateOnlyString(existing.date),
        existing.startTime,
        existing.endTime,
        existing.timezone,
      );
      if (merged.type !== ExceptionType.ADDED) {
        await this.guard.assertWindowsSafe(tutorId, [oldWindow]);
      } else {
        const newWindow = this.exceptionWindow(
          toDateOnlyString(merged.date),
          merged.startTime,
          merged.endTime,
          merged.timezone,
        );
        const removed = subtract([oldWindow], [newWindow]);
        await this.guard.assertWindowsSafe(tutorId, removed);
      }
    }

    return this.prisma.tutorAvailabilityException.update({
      where: { id },
      data: { ...dto, date: dto.date ? new Date(dto.date) : undefined },
    });
  }

  async remove(tutorId: string, id: string) {
    const existing = await this.findOwned(tutorId, id);

    if (existing.type === ExceptionType.ADDED) {
      const window = this.exceptionWindow(
        toDateOnlyString(existing.date),
        existing.startTime,
        existing.endTime,
        existing.timezone,
      );
      await this.guard.assertWindowsSafe(tutorId, [window]);
    }

    await this.prisma.tutorAvailabilityException.delete({ where: { id } });
  }

  private exceptionWindow(
    dateStr: string,
    startTime: number | null | undefined,
    endTime: number | null | undefined,
    timezone: string,
  ): Interval {
    if (startTime == null || endTime == null) {
      return {
        start: zonedTimeToUtc(dateStr, 0, timezone),
        end: zonedTimeToUtc(dateStr, 1440, timezone),
      };
    }
    return {
      start: zonedTimeToUtc(dateStr, startTime, timezone),
      end: zonedTimeToUtc(dateStr, endTime, timezone),
    };
  }

  private async findOwned(
    tutorId: string,
    id: string,
  ): Promise<TutorAvailabilityException> {
    const exception = await this.prisma.tutorAvailabilityException.findFirst({
      where: { id, tutorId },
    });
    if (!exception) {
      throw new NotFoundException('Availability exception not found');
    }
    return exception;
  }

  private validateTimeRange(
    startTime?: number | null,
    endTime?: number | null,
  ): void {
    const startMissing = startTime === null || startTime === undefined;
    const endMissing = endTime === null || endTime === undefined;
    if (startMissing !== endMissing) {
      throw new BadRequestException(
        'startTime and endTime must both be set or both omitted',
      );
    }
    if (!startMissing && (endTime as number) <= startTime) {
      throw new BadRequestException('endTime must be greater than startTime');
    }
  }
}
