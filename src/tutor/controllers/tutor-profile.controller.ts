import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UpdateProfileDto } from '../dto/profile/update-profile.dto';
import { TutorProfileService } from '../services/tutor-profile.service';

@Controller('tutor/profile')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class TutorProfileController {
  constructor(private readonly tutorProfile: TutorProfileService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('id') userId: string) {
    return this.tutorProfile.create(userId);
  }

  @Get()
  getProfile(@CurrentUser('id') userId: string) {
    return this.tutorProfile.findByUserId(userId);
  }

  @Patch()
  update(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.tutorProfile.update(userId, dto);
  }
}
