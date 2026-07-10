import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AttachInterestDto } from '../dto/interest/attach-interest.dto';
import { ReplaceInterestsDto } from '../dto/interest/replace-interests.dto';
import { LearnerInterestsService } from '../services/learner-interests.service';

@Controller('learner/interests')
@UseGuards(RolesGuard)
@Roles(UserRole.LEARNER)
export class LearnerInterestsController {
  constructor(private readonly interests: LearnerInterestsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  attach(@CurrentUser('id') userId: string, @Body() dto: AttachInterestDto) {
    return this.interests.attach(userId, dto.specialtyId);
  }

  @Put()
  replace(@CurrentUser('id') userId: string, @Body() dto: ReplaceInterestsDto) {
    return this.interests.replace(userId, dto.specialtyIds);
  }

  @Delete(':specialtyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  detach(
    @CurrentUser('id') userId: string,
    @Param('specialtyId') specialtyId: string,
  ) {
    return this.interests.detach(userId, specialtyId);
  }
}
