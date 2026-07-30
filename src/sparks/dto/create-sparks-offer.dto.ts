import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSparksOfferDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @IsPositive()
  sparksAmount!: number;

  @IsInt()
  @IsPositive()
  priceCents!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
