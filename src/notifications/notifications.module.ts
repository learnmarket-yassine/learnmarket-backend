import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsGateway } from './gateways/notifications.gateway';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthModule],
  providers: [NotificationsService, NotificationsGateway],
  controllers: [NotificationsController],
  // Exported for the domain services that trigger in-app notifications
  // (proposals, payments, holds, sessions, tutor-verification).
  exports: [NotificationsService],
})
export class NotificationsModule {}
