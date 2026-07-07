import { Module } from '@nestjs/common';
import { ConnectsModule } from '../connects/connects.module';
import { ProposalsService } from './proposals.service';
import { ProposalsController } from './proposals.controller';

@Module({
  imports: [ConnectsModule],
  providers: [ProposalsService],
  controllers: [ProposalsController],
})
export class ProposalsModule {}
