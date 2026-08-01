import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SessionsController } from './controllers/sessions.controller';
import { SessionsGateway } from './gateways/sessions.gateway';
import { SessionsService } from './services/sessions.service';
import { ZoomService } from './services/zoom.service';

@Module({
  imports: [AuthModule],
  providers: [SessionsService, SessionsGateway, ZoomService],
  controllers: [SessionsController],
  // Exported for HoldsService (provisionMeeting after booking confirmation)
  // and BookingsService (deprovisionMeeting after cancellation).
  exports: [SessionsService],
})
export class SessionsModule {}
