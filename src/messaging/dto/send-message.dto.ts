import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const MAX_MESSAGE_LENGTH = 5000;

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MESSAGE_LENGTH)
  content!: string;
}
