import { Module } from '@nestjs/common';
import { ConnectsService } from './connects.service';
import { StripeService } from './stripe.service';
import { ConnectsController } from './connects.controller';
import { ConnectsWebhookController } from './connects-webhook.controller';

@Module({
  providers: [ConnectsService, StripeService],
  controllers: [ConnectsController, ConnectsWebhookController],
  exports: [ConnectsService],
})
export class ConnectsModule {}
