import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TutorVerificationService } from '../services/tutor-verification.service';

@Controller('tutor/profile')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class TutorVerificationController {
  constructor(private readonly verification: TutorVerificationService) {}

  @Post('submit-verification')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentUser('id') userId: string) {
    return this.verification.submitForVerification(userId);
  }
}
