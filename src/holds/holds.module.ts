import { Module } from '@nestjs/common';

import { HoldsCleanupCron } from './services/holds-cleanup.cron';
import { HoldsService } from './services/holds.service';

import { HoldsController } from './controllers/holds.controller';

@Module({
  providers: [HoldsService, HoldsCleanupCron],
  controllers: [HoldsController],
  exports: [HoldsService],
})
export class HoldsModule {}
