import { LearnRequestType, ProficiencyLevel } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  MaxLength,
} from 'class-validator';
import { IsGreaterThanOrEqual } from '../../common/decorators/is-greater-than-or-equal.decorator';

export class UpdateLearnRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsEnum(LearnRequestType)
  type?: LearnRequestType;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  skillIds?: string[];

  @IsOptional()
  @IsEnum(ProficiencyLevel)
  level?: ProficiencyLevel;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  preferredLanguages?: string[];

  @IsOptional()
  @IsInt()
  @IsPositive()
  requestedFrequency?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  budgetMin?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsGreaterThanOrEqual('budgetMin')
  budgetMax?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
