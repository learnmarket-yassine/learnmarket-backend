import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  hoursPerWeek?: string;

  @IsOptional()
  @IsUrl()
  videoIntroUrl?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  skills?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  hourlyRate?: number;
}
