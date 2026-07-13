import { Module } from '@nestjs/common';

import { BookingsCompletionCron } from './services/bookings-completion.cron';
import { BookingsService } from './services/bookings.service';

import { BookingsController } from './controllers/bookings.controller';

@Module({
  providers: [BookingsService, BookingsCompletionCron],
  controllers: [BookingsController],
})
export class BookingsModule {}
