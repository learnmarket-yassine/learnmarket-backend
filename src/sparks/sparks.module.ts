import { Module } from '@nestjs/common';
import { StripeModule } from '../payments/stripe.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { SparksService } from './services/sparks.service';
import { SparksGrantCron } from './services/sparks-grant.cron';
import { SparksController } from './controllers/sparks.controller';
import { AdminSparksOfferController } from './controllers/admin-sparks-offer.controller';

@Module({
  imports: [StripeModule, PlatformSettingsModule],
  providers: [SparksService, SparksGrantCron],
  controllers: [SparksController, AdminSparksOfferController],
  exports: [SparksService],
})
export class SparksModule {}
