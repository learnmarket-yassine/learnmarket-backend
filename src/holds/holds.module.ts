import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { SessionsModule } from '../sessions/sessions.module';
import { HoldsCleanupCron } from './services/holds-cleanup.cron';
import { HoldsService } from './services/holds.service';

import { HoldsController } from './controllers/holds.controller';

@Module({
  imports: [SessionsModule, NotificationsModule],
  providers: [HoldsService, HoldsCleanupCron],
  controllers: [HoldsController],
  exports: [HoldsService],
})
export class HoldsModule {}
