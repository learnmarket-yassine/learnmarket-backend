import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateLessonDto } from './create-lesson.dto';

export class CreateProposalDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsInt()
  @IsPositive()
  sessionDurationMinutes!: number;

  @IsInt()
  @IsPositive()
  totalSessions!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  totalPrice!: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLessonDto)
  lessons?: CreateLessonDto[];
}
