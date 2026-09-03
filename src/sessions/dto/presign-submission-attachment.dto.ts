import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PresignSubmissionAttachmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;
}
