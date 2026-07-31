import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { DailyModule } from './daily.module';
import { AnnouncementsController } from './controllers/announcements.controller';
import { AssignmentsController } from './controllers/assignments.controller';
import { DailyWebhookController } from './controllers/daily-webhook.controller';
import { SessionsController } from './controllers/sessions.controller';
import { SessionsGateway } from './gateways/sessions.gateway';
import { AnnouncementsService } from './services/announcements.service';
import { AssignmentsService } from './services/assignments.service';
import { SessionsService } from './services/sessions.service';
import { SessionReviewAutoResolveCron } from './services/session-review-auto-resolve.cron';

@Module({
  imports: [AuthModule, DailyModule, PaymentsModule],
  providers: [
    SessionsService,
    SessionsGateway,
    AnnouncementsService,
    AssignmentsService,
    SessionReviewAutoResolveCron,
  ],
  controllers: [
    SessionsController,
    AnnouncementsController,
    AssignmentsController,
    DailyWebhookController,
  ],
  // Exported for HoldsService (provisionMeeting/updateMeetingTime after
  // booking confirmation) and BookingsModule (completeSessionCascade).
  exports: [SessionsService],
})
export class SessionsModule {}
