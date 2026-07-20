import {
  LearnRequestStatus,
  LearnRequestType,
  ProficiencyLevel,
} from '@prisma/client';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const splitCsv = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.split(',') : value;

export class GetLearnRequestsQueryDto {
  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsEnum(LearnRequestStatus, { each: true })
  status?: LearnRequestStatus[];

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsEnum(LearnRequestType, { each: true })
  type?: LearnRequestType[];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  actionNeeded?: boolean;

  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @IsEnum(ProficiencyLevel, { each: true })
  level?: ProficiencyLevel[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budgetMax?: number;

  @IsOptional()
  @Transform(splitCsv)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  preferredLanguages?: string[];

  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string'
      ? value.split(',').map((item) => Number(item))
      : value,
  )
  @IsArray()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  requestedFrequency?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  take = 10;
}
