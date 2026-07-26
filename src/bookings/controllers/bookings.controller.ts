import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BookingsService } from '../services/bookings.service';
import { GetMyBookingsQueryDto } from '../dto/get-my-bookings-query.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('mine')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.LEARNER)
  findMine(
    @CurrentUser() user: AuthUser,
    @Query() query: GetMyBookingsQueryDto,
  ) {
    return user.role === UserRole.TUTOR
      ? this.bookings.findConfirmedByTutor(user.id, query)
      : this.bookings.findConfirmedByLearner(user.id, query);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.bookings.cancel(userId, id);
  }
}
