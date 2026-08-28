import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { DailyModule } from './daily.module';
import { AnnouncementsController } from './controllers/announcements.controller';
import { AssignmentsController } from './controllers/assignments.controller';
import { DailyWebhookController } from './controllers/daily-webhook.controller';
import { SessionsController } from './controllers/sessions.controller';
import { AdminSessionDisputesController } from './controllers/admin-session-disputes.controller';
import { AnnouncementsService } from './services/announcements.service';
import { AssignmentsService } from './services/assignments.service';
import { SessionsService } from './services/sessions.service';
import { SessionReviewAutoResolveCron } from './services/session-review-auto-resolve.cron';

@Module({
  imports: [AuthModule, DailyModule, PaymentsModule, NotificationsModule],
  providers: [
    SessionsService,
    AnnouncementsService,
    AssignmentsService,
    SessionReviewAutoResolveCron,
  ],
  controllers: [
    SessionsController,
    AnnouncementsController,
    AssignmentsController,
    DailyWebhookController,
    AdminSessionDisputesController,
  ],
  exports: [SessionsService],
})
export class SessionsModule {}
