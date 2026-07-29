import { Controller, Headers, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { StripeService } from '../services/stripe.service';
import { WebhookHandlerService } from '../services/webhook-handler.service';

@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(
    private readonly stripe: StripeService,
    private readonly webhookHandler: WebhookHandlerService,
  ) {}

  @Public()
  @Post()
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    // Signature verification happens BEFORE anything else touches the
    // payload -- an unverified webhook endpoint is a direct financial
    // forgery vector. constructWebhookEvent throws on an invalid/missing
    // signature; that error is intentionally left uncaught here so Nest
    // returns a 400 and the request is never processed.
    const event = this.stripe.constructWebhookEvent(req.rawBody!, signature);
    return this.webhookHandler.handle(event);
  }
}
