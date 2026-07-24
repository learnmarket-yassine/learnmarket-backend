import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MessagingController } from './controllers/messaging.controller';
import { MessagingGateway } from './gateways/messaging.gateway';
import { MessagingService } from './services/messaging.service';

@Module({
  imports: [AuthModule],
  providers: [MessagingService, MessagingGateway],
  controllers: [MessagingController],
  // Exported for ProposalsService to trigger conversation-activation
  // recomputation when proposal state changes (create/withdraw/accept).
  exports: [MessagingService],
})
export class MessagingModule {}
