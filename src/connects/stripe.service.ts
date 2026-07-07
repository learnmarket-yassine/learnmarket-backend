import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { ConnectsPackage } from '@prisma/client';

@Injectable()
export class StripeService {
  readonly client: Stripe;

  constructor(private readonly config: ConfigService) {
    this.client = new Stripe(
      this.config.getOrThrow<string>('STRIPE_SECRET_KEY'),
    );
  }

  createCheckoutSession(
    pkg: ConnectsPackage,
    tutorUserId: string,
  ): Promise<Stripe.Response<Stripe.Checkout.Session>> {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');

    return this.client.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price: pkg.stripePriceId ?? undefined,
          price_data: pkg.stripePriceId
            ? undefined
            : {
                currency: pkg.currency,
                unit_amount: pkg.priceCents,
                product_data: {
                  name: pkg.name,
                  description: `${pkg.amount} connects`,
                },
              },
        },
      ],
      metadata: {
        tutorUserId,
        packageId: pkg.id,
      },
      // Propagate metadata onto the PaymentIntent too, since
      // payment_intent.succeeded doesn't carry the session's metadata.
      payment_intent_data: {
        metadata: {
          tutorUserId,
          packageId: pkg.id,
        },
      },
      success_url: `${frontendUrl}/connects/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/connects/purchase/cancelled`,
    });
  }

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.config.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    return this.client.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );
  }
}
