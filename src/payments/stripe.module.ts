import { Module } from '@nestjs/common';
import { StripeService } from './services/stripe.service';

@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
