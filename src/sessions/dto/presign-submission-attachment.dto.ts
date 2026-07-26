import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Mirrors PresignUploadDto minus `purpose` -- the purpose is forced
// server-side to SUBMISSION_ATTACHMENT so the client can't presign into a
// different bucket namespace.
export class PresignSubmissionAttachmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;
}
