import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Sanity cap on message length -- keeps garbage/overflow-adjacent input
// out before it ever reaches the database's unbounded Text column.
export const MAX_MESSAGE_LENGTH = 5000;

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MESSAGE_LENGTH)
  content!: string;
}
