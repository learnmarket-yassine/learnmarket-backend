// reset-password.dto.ts
import { IsNotEmpty, IsString, IsStrongPassword } from 'class-validator';
import { Match } from '../../common/decorators/match.decorator';

export class ResetPasswordDto {
  @IsString()
  resetToken!: string;

  @IsString()
  @IsNotEmpty()
  @IsStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  })
  newPassword!: string;

  @IsString()
  @IsNotEmpty()
  @IsStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  })
  @Match('newPassword', { message: 'Passwords do not match' })
  confirmPassword!: string;
}
