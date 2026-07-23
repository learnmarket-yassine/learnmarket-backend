import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum ProposalGroup {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export class GetMyProposalsQueryDto {
  @IsOptional()
  @IsEnum(ProposalGroup)
  group?: ProposalGroup;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  take = 10;
}
