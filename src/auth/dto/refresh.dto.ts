import { IsOptional, IsString } from 'class-validator';

/**
 * Mobile clients send the raw refresh token in the body. Web clients send
 * it via an httpOnly cookie, so the body field is optional.
 */
export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
