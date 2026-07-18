import { IsUUID } from 'class-validator';

export class AddCategorySkillDto {
  @IsUUID()
  skillId!: string;
}
