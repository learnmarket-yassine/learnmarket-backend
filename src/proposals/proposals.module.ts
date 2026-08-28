import { Module } from '@nestjs/common';

import { MessagingModule } from '../messaging/messaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SparksModule } from '../sparks/sparks.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { ProposalsService } from './services/proposals.service';
import { ShortlistedProposalsService } from './services/shortlisted-proposals.service';
import { ProposalsController } from './controllers/proposals.controller';
import { ShortlistedProposalsController } from './controllers/shortlisted-proposals.controller';

@Module({
  imports: [
    MessagingModule,
    SparksModule,
    NotificationsModule,
    PlatformSettingsModule,
  ],
  providers: [ProposalsService, ShortlistedProposalsService],
  controllers: [ShortlistedProposalsController, ProposalsController],
  exports: [ProposalsService],
})
export class ProposalsModule {}
