import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelProposalDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
