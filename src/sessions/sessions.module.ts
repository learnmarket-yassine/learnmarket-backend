import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AnnouncementsController } from './controllers/announcements.controller';
import { AssignmentsController } from './controllers/assignments.controller';
import { SessionsController } from './controllers/sessions.controller';
import { SessionsGateway } from './gateways/sessions.gateway';
import { AnnouncementsService } from './services/announcements.service';
import { AssignmentsService } from './services/assignments.service';
import { SessionsService } from './services/sessions.service';
import { ZoomService } from './services/zoom.service';

@Module({
  imports: [AuthModule],
  providers: [
    SessionsService,
    SessionsGateway,
    ZoomService,
    AnnouncementsService,
    AssignmentsService,
  ],
  controllers: [
    SessionsController,
    AnnouncementsController,
    AssignmentsController,
  ],
  // Exported for HoldsService (provisionMeeting after booking confirmation)
  // and BookingsService (deprovisionMeeting after cancellation).
  exports: [SessionsService],
})
export class SessionsModule {}
