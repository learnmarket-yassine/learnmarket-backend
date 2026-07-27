import { Module } from '@nestjs/common';

import { SessionsModule } from '../sessions/sessions.module';
import { HoldsCleanupCron } from './services/holds-cleanup.cron';
import { HoldsService } from './services/holds.service';

import { HoldsController } from './controllers/holds.controller';

@Module({
  imports: [SessionsModule],
  providers: [HoldsService, HoldsCleanupCron],
  controllers: [HoldsController],
  exports: [HoldsService],
})
export class HoldsModule {}
