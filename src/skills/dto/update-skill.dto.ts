import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateSkillDto } from './create-skill.dto';

export class UpdateSkillDto extends PartialType(CreateSkillDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
