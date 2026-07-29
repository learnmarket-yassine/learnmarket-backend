import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
        // Default automatic payout schedule (Stripe's standard behavior) is
        // intentionally left as-is -- no wallet/manual-withdrawal feature
        // exists in this build, so there's no reason to override it to
        // manual. Money reaches the tutor's real bank account on Stripe's
        // normal schedule once transferred to their Connect balance.
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
        // critical -- this is how the webhook handler maps a Stripe event
        // back to a specific Proposal/Payment
        metadata: { proposalId },
      },
      // scoped to proposalId specifically -- a retried "Hire" click for the
      // SAME proposal must not create a second PaymentIntent
      { idempotencyKey: `payment-intent-${proposalId}` },
    );
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
      // scoped to payoutId -- if a cron run somehow overlaps or retries for
      // the same session, this key guarantees Stripe itself rejects the
      // duplicate rather than double-paying the tutor
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
    // Throws on an invalid/missing signature -- callers must never catch and
    // swallow this. An unverified webhook is a direct financial forgery
    // vector.
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET'),
    );
  }
}
