import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PortfolioMediaType } from '@prisma/client';

export class AddPortfolioMediaDto {
  @IsEnum(PortfolioMediaType)
  type!: PortfolioMediaType;

  @ValidateIf(
    (dto: AddPortfolioMediaDto) =>
      dto.type === PortfolioMediaType.IMAGE ||
      dto.type === PortfolioMediaType.VIDEO_FILE,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  key?: string;

  @ValidateIf(
    (dto: AddPortfolioMediaDto) =>
      dto.type === PortfolioMediaType.VIDEO_LINK ||
      dto.type === PortfolioMediaType.LINK,
  )
  @IsUrl()
  url?: string;
}
