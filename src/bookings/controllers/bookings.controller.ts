import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BookingsService } from '../services/bookings.service';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get('mine')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TUTOR)
  findConfirmedForTutor(@CurrentUser('id') tutorId: string) {
    return this.bookings.findConfirmedByTutor(tutorId);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.bookings.cancel(userId, id);
  }
}
