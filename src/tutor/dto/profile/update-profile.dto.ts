import { IsOptional, IsUrl } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsUrl()
  videoIntroUrl?: string | null;
}
