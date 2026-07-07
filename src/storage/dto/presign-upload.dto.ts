import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { UploadPurpose } from '../upload-purpose.enum';

export class PresignUploadDto {
  @IsEnum(UploadPurpose)
  purpose!: UploadPurpose;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;
}
