import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { Public } from '../common/decorators/public.decorator';
import { ConnectsService } from './connects.service';
import { StripeService } from './stripe.service';

@Controller('connects')
export class ConnectsWebhookController {
  constructor(
    private readonly connects: ConnectsService,
    private readonly stripe: StripeService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Missing Stripe signature or body');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(req.rawBody, signature);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    await this.connects.handleStripeEvent(event);
    return { received: true };
  }
}
