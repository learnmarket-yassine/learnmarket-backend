import { Module } from '@nestjs/common';

import { PaymentsModule } from '../payments/payments.module';
import { SessionsModule } from '../sessions/sessions.module';
import { BookingsCompletionCron } from './services/bookings-completion.cron';
import { BookingsService } from './services/bookings.service';

import { BookingsController } from './controllers/bookings.controller';

@Module({
  imports: [PaymentsModule, SessionsModule],
  providers: [BookingsService, BookingsCompletionCron],
  controllers: [BookingsController],
})
export class BookingsModule {}
