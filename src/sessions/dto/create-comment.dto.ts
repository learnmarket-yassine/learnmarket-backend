import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const MAX_COMMENT_LENGTH = 5000;

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_COMMENT_LENGTH)
  content!: string;
}

export class UpdateCommentDto extends CreateCommentDto {}
