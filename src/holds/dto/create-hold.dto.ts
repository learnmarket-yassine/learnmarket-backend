import { IsISO8601, IsString } from 'class-validator';

export class CreateHoldDto {
  @IsString()
  proposalSessionId!: string;

  @IsISO8601()
  startTime!: string;

  @IsISO8601()
  endTime!: string;
}
