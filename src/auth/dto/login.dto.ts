import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  /** Human-friendly label shown in the sessions list, e.g. "iPhone 14". */
  @IsOptional()
  @IsString()
  deviceName?: string;
}
