import { Module } from '@nestjs/common';

import { JobRequestsService } from './services/job-requests.service';
import { ProposalsService } from './services/proposals.service';

import { JobRequestsController } from './controllers/job-requests.controller';
import { ProposalsController } from './controllers/proposals.controller';

@Module({
  providers: [JobRequestsService, ProposalsService],
  controllers: [JobRequestsController, ProposalsController],
})
export class ProposalsModule {}
