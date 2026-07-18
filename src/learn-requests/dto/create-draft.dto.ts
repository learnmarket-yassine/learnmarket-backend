import { LearnRequestType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateLearnRequestDraftDto {
  @IsEnum(LearnRequestType)
  type!: LearnRequestType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;
}
