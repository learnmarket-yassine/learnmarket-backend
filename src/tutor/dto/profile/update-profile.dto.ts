import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
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
  @IsNumber()
  @Min(0)
  @Max(10000)
  hourlyRate?: number;
}
