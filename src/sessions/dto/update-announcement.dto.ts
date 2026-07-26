import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_ANNOUNCEMENT_LENGTH } from './create-announcement.dto';

export class UpdateAnnouncementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_ANNOUNCEMENT_LENGTH)
  content!: string;
}
