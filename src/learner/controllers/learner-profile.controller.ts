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
import { UpdateAvailabilityDto } from '../dto/availability/update-availability.dto';
import { LearnerProfileService } from '../services/learner-profile.service';

@Controller('learner/profile')
@UseGuards(RolesGuard)
@Roles(UserRole.LEARNER)
export class LearnerProfileController {
  constructor(private readonly learnerProfile: LearnerProfileService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('id') userId: string) {
    return this.learnerProfile.create(userId);
  }

  @Get()
  getProfile(@CurrentUser('id') userId: string) {
    return this.learnerProfile.findByUserId(userId);
  }

  @Patch('availability')
  updateAvailability(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.learnerProfile.updateAvailability(userId, dto);
  }
}
