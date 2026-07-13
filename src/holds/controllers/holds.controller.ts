import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateHoldDto } from '../dto/create-hold.dto';
import { HoldsService } from '../services/holds.service';

@Controller('holds')
@UseGuards(RolesGuard)
@Roles(UserRole.LEARNER)
export class HoldsController {
  constructor(private readonly holds: HoldsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('id') learnerId: string, @Body() dto: CreateHoldDto) {
    return this.holds.requestHold(learnerId, dto);
  }

  @Post(':id/confirm')
  async confirm(@CurrentUser('id') learnerId: string, @Param('id') id: string) {
    await this.holds.assertLearnerOwnsHold(learnerId, id);
    return this.holds.confirmSlotHold(id);
  }

  @Post(':id/release')
  async release(@CurrentUser('id') learnerId: string, @Param('id') id: string) {
    await this.holds.assertLearnerOwnsHold(learnerId, id);
    return this.holds.releaseSlotHold(id);
  }
}
