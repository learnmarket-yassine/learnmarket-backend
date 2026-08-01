import { Module } from '@nestjs/common';

import { SessionsModule } from '../sessions/sessions.module';
import { BookingsCompletionCron } from './services/bookings-completion.cron';
import { BookingsService } from './services/bookings.service';

import { BookingsController } from './controllers/bookings.controller';

@Module({
  imports: [SessionsModule],
  providers: [BookingsService, BookingsCompletionCron],
  controllers: [BookingsController],
})
export class BookingsModule {}
