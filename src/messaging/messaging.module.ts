import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MessagingController } from './controllers/messaging.controller';
import { MessagingGateway } from './gateways/messaging.gateway';
import { MessagingService } from './services/messaging.service';

@Module({
  imports: [AuthModule],
  providers: [MessagingService, MessagingGateway],
  controllers: [MessagingController],
  exports: [MessagingService],
})
export class MessagingModule {}
