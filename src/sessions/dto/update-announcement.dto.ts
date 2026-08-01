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
import { MAX_ANNOUNCEMENT_LENGTH } from './create-announcement.dto';

export class UpdateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ANNOUNCEMENT_LENGTH)
  content!: string;

  // New attachments to append; existing ones are untouched.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachFileDto)
  attachments?: AttachFileDto[];
}
