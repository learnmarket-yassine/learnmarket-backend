import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  objective?: string;
}
