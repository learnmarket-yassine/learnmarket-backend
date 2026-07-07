import { IsUUID } from 'class-validator';

export class AttachSkillDto {
  @IsUUID()
  skillId!: string;
}
