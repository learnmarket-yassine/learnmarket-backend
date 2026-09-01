import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Type } from 'class-transformer';

export class ListSkillsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;

  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;

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
