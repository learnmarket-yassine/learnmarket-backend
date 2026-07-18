import { Module } from '@nestjs/common';

import { ProposalsService } from './services/proposals.service';
import { ProposalsController } from './controllers/proposals.controller';

@Module({
  providers: [ProposalsService],
  controllers: [ProposalsController],
})
export class ProposalsModule {}
