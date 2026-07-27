import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AttachFileDto } from '../../storage/dto/attach-file.dto';

export const MAX_ANNOUNCEMENT_LENGTH = 5000;

export class CreateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ANNOUNCEMENT_LENGTH)
  content!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachFileDto)
  attachments?: AttachFileDto[];
}
