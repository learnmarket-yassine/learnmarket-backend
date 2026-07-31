import { Module } from '@nestjs/common';
import { DailyService } from './services/daily.service';

@Module({
  providers: [DailyService],
  exports: [DailyService],
})
export class DailyModule {}
