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
    const event = this.stripe.constructWebhookEvent(req.rawBody!, signature);
    return this.webhookHandler.handle(event);
  }

  @Public()
  @Post('connect')
  async handleConnect(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const event = this.stripe.constructConnectWebhookEvent(
      req.rawBody!,
      signature,
    );
    return this.webhookHandler.handle(event);
  }
}
