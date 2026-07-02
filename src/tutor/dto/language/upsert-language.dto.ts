import { LanguageLevel } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpsertLanguageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  language!: string;

  @IsEnum(LanguageLevel)
  level!: LanguageLevel;
}
