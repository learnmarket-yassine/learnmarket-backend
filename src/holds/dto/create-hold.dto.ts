import { IsISO8601, IsString } from 'class-validator';

export class CreateHoldDto {
  @IsString()
  sessionId!: string;

  @IsISO8601()
  startTime!: string;
}
