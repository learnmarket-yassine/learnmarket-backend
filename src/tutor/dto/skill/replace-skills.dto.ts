import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class ReplaceSkillsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  skillIds!: string[];
}
