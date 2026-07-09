import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListSkillsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;

  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;
}
