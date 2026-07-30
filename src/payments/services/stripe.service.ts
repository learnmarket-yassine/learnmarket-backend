import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SparksOffer } from '@prisma/client';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(
      this.config.getOrThrow<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2026-06-24.dahlia',
      },
    );
  }

  async createConnectedAccount(
    tutorId: string,
    email: string,
  ): Promise<Stripe.Account> {
    return this.stripe.accounts.create(
      {
        type: 'express',
        email,
        capabilities: { transfers: { requested: true } },
      },
      { idempotencyKey: `connect-account-${tutorId}` },
    );
  }

  async createOnboardingLink(
    stripeAccountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<Stripe.AccountLink> {
    return this.stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
  }

  async createPaymentIntent(
    proposalId: string,
    amountCents: number,
    currency: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency,
        metadata: { proposalId },
      },
      { idempotencyKey: `payment-intent-${proposalId}` },
    );
  }

  async createSparksPaymentIntent(
    offer: SparksOffer,
    tutorId: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create({
      amount: offer.priceCents,
      currency: offer.currency,
      metadata: {
        type: 'sparks_purchase',
        tutorId,
        offerId: offer.id,
        sparksAmount: String(offer.sparksAmount),
      },
    });
  }

  async createTransfer(
    payoutId: string,
    stripeAccountId: string,
    amountCents: number,
    currency: string,
  ): Promise<Stripe.Transfer> {
    return this.stripe.transfers.create(
      {
        amount: amountCents,
        currency,
        destination: stripeAccountId,
        metadata: { payoutId },
      },
      { idempotencyKey: `transfer-${payoutId}` },
    );
  }

  async createRefund(
    paymentId: string,
    stripePaymentIntentId: string,
    amountCents: number,
  ): Promise<Stripe.Refund> {
    return this.stripe.refunds.create(
      {
        payment_intent: stripePaymentIntentId,
        amount: amountCents,
      },
      { idempotencyKey: `refund-${paymentId}` },
    );
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET'),
    );
  }
}
