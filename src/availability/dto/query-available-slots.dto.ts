import { Type } from 'class-transformer';
import { IsInt, IsPositive, Matches, Max } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class QueryAvailableSlotsDto {
  @Matches(DATE_ONLY, { message: 'fromDate must be in YYYY-MM-DD format' })
  fromDate!: string;

  @Matches(DATE_ONLY, { message: 'toDate must be in YYYY-MM-DD format' })
  toDate!: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(480)
  durationMinutes!: number;
}
