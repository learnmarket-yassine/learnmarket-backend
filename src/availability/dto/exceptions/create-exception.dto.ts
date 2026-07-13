import { ExceptionType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { IsIanaTimezone } from '../../../common/decorators/is-iana-timezone.decorator';
import { IsOptionalMinutesOfDay } from '../../../common/decorators/is-optional-minutes-of-day.decorator';
import { IsValidTimeRange } from '../../../common/decorators/is-valid-time-range.decorator';

export class CreateExceptionDto {
  @IsDateString()
  date!: string;

  @IsEnum(ExceptionType)
  type!: ExceptionType;

  @IsOptionalMinutesOfDay()
  startTime?: number;

  @IsOptionalMinutesOfDay()
  @IsValidTimeRange('startTime')
  endTime?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsIanaTimezone()
  timezone!: string;
}
