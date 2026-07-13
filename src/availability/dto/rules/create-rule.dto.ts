import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsIanaTimezone } from '../../../common/decorators/is-iana-timezone.decorator';
import { IsValidTimeRange } from '../../../common/decorators/is-valid-time-range.decorator';

export class CreateRuleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  startTime!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  @IsValidTimeRange('startTime')
  endTime!: number;

  @IsIanaTimezone()
  timezone!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
