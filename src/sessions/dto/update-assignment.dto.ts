import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AttachFileDto } from '../../storage/dto/attach-file.dto';

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date;

  // New reference materials to append; existing attachments are untouched.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachFileDto)
  attachments?: AttachFileDto[];
}
