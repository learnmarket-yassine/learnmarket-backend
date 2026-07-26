import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const MAX_COMMENT_LENGTH = 5000;

// Shared between announcement comments and assignment comments -- both are
// plain content-only bodies with the same validation.
export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMENT_LENGTH)
  content!: string;
}
