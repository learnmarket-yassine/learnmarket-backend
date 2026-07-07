import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProposalDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
