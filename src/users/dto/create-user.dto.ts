import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  firstname!: string;

  @IsString()
  lastname!: string;

  @IsString()
  location!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
