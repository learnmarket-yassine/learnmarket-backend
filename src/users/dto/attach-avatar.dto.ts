import { IsNotEmpty, IsString } from 'class-validator';

export class AttachAvatarDto {
  @IsString()
  @IsNotEmpty()
  key!: string;
}
