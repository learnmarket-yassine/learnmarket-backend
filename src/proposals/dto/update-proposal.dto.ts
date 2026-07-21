import { IsOptional, IsString } from 'class-validator';

export class UpdateProposalDto {
  @IsOptional()
  @IsString()
  message?: string;
}
