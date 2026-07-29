import { Module } from '@nestjs/common';

import { MessagingModule } from '../messaging/messaging.module';
import { ProposalsService } from './services/proposals.service';
import { ShortlistedProposalsService } from './services/shortlisted-proposals.service';
import { ProposalsController } from './controllers/proposals.controller';
import { ShortlistedProposalsController } from './controllers/shortlisted-proposals.controller';

@Module({
  imports: [MessagingModule],
  providers: [ProposalsService, ShortlistedProposalsService],
  controllers: [ShortlistedProposalsController, ProposalsController],
  exports: [ProposalsService],
})
export class ProposalsModule {}
