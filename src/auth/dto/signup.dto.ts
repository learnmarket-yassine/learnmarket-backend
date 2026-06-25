/* eslint-disable @typescript-eslint/no-unsafe-return */
import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  MaxLength,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';
import { Transform } from 'class-transformer';

@ValidatorConstraint({ name: 'MatchPassword' })
class MatchPasswordConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: string, args: ValidationArguments): boolean {
    const dto = args.object as SignupDto;
    return confirmPassword === dto.password;
  }

  defaultMessage(): string {
    return 'Passwords do not match';
  }
}

export class SignupDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }) => value?.toLowerCase().trim())
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  firstname!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  lastname!: string;

  @IsString()
  @IsNotEmpty()
  @IsStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @Validate(MatchPasswordConstraint)
  confirmPassword!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
