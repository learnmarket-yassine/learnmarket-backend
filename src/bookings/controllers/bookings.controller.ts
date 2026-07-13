import { Controller, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BookingsService } from '../services/bookings.service';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Patch(':id/cancel')
  cancel(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.bookings.cancel(userId, id);
  }
}
