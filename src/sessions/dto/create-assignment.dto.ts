import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AttachFileDto } from '../../storage/dto/attach-file.dto';

export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachFileDto)
  attachments?: AttachFileDto[];
}
