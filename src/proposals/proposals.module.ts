import { Module } from '@nestjs/common';

import { MessagingModule } from '../messaging/messaging.module';
import { ProposalsService } from './services/proposals.service';
import { ProposalsController } from './controllers/proposals.controller';

@Module({
  imports: [MessagingModule],
  providers: [ProposalsService],
  controllers: [ProposalsController],
})
export class ProposalsModule {}
