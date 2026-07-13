import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class UpdateProposalDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  sessionDurationMinutes?: number;
}
