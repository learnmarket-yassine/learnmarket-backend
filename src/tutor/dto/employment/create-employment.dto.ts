import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEmploymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  jobTitle!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  company!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
