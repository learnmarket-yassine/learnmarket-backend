import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, PaymentStatus, Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import Stripe from 'stripe';
import { NotificationsService } from '../../notifications/notifications.service';
import { ProposalsService } from '../../proposals/services/proposals.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SparksService } from '../../sparks/services/sparks.service';
import { PayoutsService } from './payouts.service';
import { PaymentsGateway } from '../gateways/payments.gateway';

@Injectable()
export class WebhookHandlerService {
  private readonly logger = new Logger(WebhookHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proposalsService: ProposalsService,
    private readonly payoutsService: PayoutsService,
    private readonly paymentsGateway: PaymentsGateway,
    private readonly sparksService: SparksService,
    private readonly notifications: NotificationsService,
  ) {}

  async handle(event: Stripe.Event): Promise<{ received: true }> {
    const alreadyProcessed = await this.prisma.stripeWebhookEvent.findUnique({
      where: { id: event.id },
    });
    if (alreadyProcessed) return { received: true };
    let retryOnboardingAccountId: string | null = null;
    let acceptedFor: {
      learnerId: string;
      tutorId: string;
      proposalId: string;
    } | null = null;

    switch (event.type) {
      case 'payment_intent.succeeded':
        acceptedFor = await this.prisma.$transaction(async (tx) => {
          const result = await this.handlePaymentSucceeded(tx, event);
          await this.recordEvent(tx, event);
          return result;
        });
        break;
      case 'payment_intent.payment_failed':
        await this.prisma.$transaction(async (tx) => {
          await this.handlePaymentFailed(tx, event);
          await this.recordEvent(tx, event);
        });
        break;
      case 'account.updated':
        retryOnboardingAccountId = await this.prisma.$transaction(
          async (tx) => {
            const accountId = await this.handleAccountUpdated(tx, event);
            await this.recordEvent(tx, event);
            return accountId;
          },
        );
        break;
      case 'charge.dispute.created':
        await this.prisma.$transaction(async (tx) => {
          await this.handleChargeDispute(tx, event);
          await this.recordEvent(tx, event);
        });
        break;
      case 'charge.refunded':
        await this.prisma.$transaction(async (tx) => {
          await this.handleChargeRefunded(tx, event);
          await this.recordEvent(tx, event);
        });
        break;
      default:
        await this.prisma.$transaction((tx) => this.recordEvent(tx, event));
    }

    if (retryOnboardingAccountId) {
      await this.payoutsService.retryPendingOnboardingPayouts(
        retryOnboardingAccountId,
      );
    }
    if (acceptedFor) {
      this.paymentsGateway.emitProposalAccepted(
        acceptedFor.learnerId,
        acceptedFor.proposalId,
      );
      await this.notifications.create(
        acceptedFor.tutorId,
        NotificationType.PROPOSAL_HIRED,
        'Your proposal was hired',
        'A learner accepted your proposal and payment was confirmed.',
        { proposalId: acceptedFor.proposalId },
      );
    }

    return { received: true };
  }

  private recordEvent(tx: Prisma.TransactionClient, event: Stripe.Event) {
    return tx.stripeWebhookEvent.create({
      data: { id: event.id, type: event.type },
    });
  }

  private async handlePaymentSucceeded(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<{
    learnerId: string;
    tutorId: string;
    proposalId: string;
  } | null> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    if (paymentIntent.metadata?.type === 'sparks_purchase') {
      await this.sparksService.fulfillSparksPurchase(tx, paymentIntent);
      return null;
    }

    const payment = await tx.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    });
    if (!payment) {
      throw new Error(
        `No Payment record for PaymentIntent ${paymentIntent.id}`,
      );
    }
    if (payment.status === PaymentStatus.SUCCEEDED) return null; // idempotent guard

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.SUCCEEDED, succeededAt: new Date() },
    });
    await this.proposalsService.runAcceptTransaction(tx, payment.proposalId);
    const proposal = await tx.proposal.findUniqueOrThrow({
      where: { id: payment.proposalId },
      select: { tutorId: true },
    });

    return {
      learnerId: payment.learnerId,
      tutorId: proposal.tutorId,
      proposalId: payment.proposalId,
    };
  }

  private async handlePaymentFailed(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const payment = await tx.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    });
    if (!payment) {
      this.logger.error(
        `payment_intent.payment_failed for unknown PaymentIntent ${paymentIntent.id}`,
      );
      return;
    }
    // No further action -- the Proposal was never touched, nothing to roll
    // back. The learner can simply retry checkout.
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });
  }

  /** Returns the Stripe account id if payouts just became enabled (caller retries stuck payouts outside the transaction), else null. */
  private async handleAccountUpdated(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<string | null> {
    const account = event.data.object as Stripe.Account;
    await tx.tutorProfile.updateMany({
      where: { stripeAccountId: account.id },
      data: {
        stripeChargesEnabled: !!account.charges_enabled,
        stripePayoutsEnabled: !!account.payouts_enabled,
        stripeDetailsSubmittedAt: account.details_submitted ? new Date() : null,
      },
    });
    return account.payouts_enabled ? account.id : null;
  }

  private async handleChargeDispute(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    const dispute = event.data.object as Stripe.Dispute;
    const paymentIntentId =
      typeof dispute.payment_intent === 'string'
        ? dispute.payment_intent
        : dispute.payment_intent?.id;
    const payment = paymentIntentId
      ? await tx.payment.findUnique({
          where: { stripePaymentIntentId: paymentIntentId },
        })
      : null;

    if (!payment) {
      this.logger.error(
        `charge.dispute.created (dispute ${dispute.id}) for unresolvable PaymentIntent ${paymentIntentId}`,
      );
      Sentry.captureMessage('Stripe dispute with no matching Payment', {
        level: 'error',
        extra: { stripeDisputeId: dispute.id, paymentIntentId },
      });
      return;
    }

    await tx.paymentDispute.create({
      data: {
        paymentId: payment.id,
        stripeDisputeId: dispute.id,
        amount: dispute.amount / 100,
        reason: dispute.reason ?? undefined,
        status: dispute.status,
      },
    });

    // A real chargeback -- silently doing nothing here is not acceptable
    // for a payment module. No admin-notification channel exists yet
    // beyond logging + Sentry + the admin-readable PaymentDispute record.
    this.logger.error(
      `Stripe dispute created: paymentId=${payment.id} amount=${dispute.amount / 100} disputeId=${dispute.id}`,
    );
    Sentry.captureMessage('Stripe charge dispute created', {
      level: 'error',
      extra: {
        paymentId: payment.id,
        amount: dispute.amount / 100,
        stripeDisputeId: dispute.id,
      },
    });
  }

  /**
   * Self-heals the crash window in cancelAndRefund where a Stripe refund
   * succeeds but the DB write recording it fails afterward -- idempotent
   * upsert of the Refund row by stripeRefundId (no-op if our own code path
   * already recorded it) + recompute Payment.status from Stripe's own
   * amount_refunded, which is authoritative.
   */
  private async handleChargeRefunded(
    tx: Prisma.TransactionClient,
    event: Stripe.Event,
  ): Promise<void> {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;
    const payment = paymentIntentId
      ? await tx.payment.findUnique({
          where: { stripePaymentIntentId: paymentIntentId },
        })
      : null;
    if (!payment) {
      this.logger.error(
        `charge.refunded for unresolvable PaymentIntent ${paymentIntentId}`,
      );
      return;
    }

    for (const refund of charge.refunds?.data ?? []) {
      const exists = await tx.refund.findUnique({
        where: { stripeRefundId: refund.id },
      });
      if (!exists) {
        await tx.refund.create({
          data: {
            paymentId: payment.id,
            stripeRefundId: refund.id,
            amount: refund.amount / 100,
            reason: refund.reason ?? undefined,
          },
        });
      }
    }

    const desiredStatus =
      charge.amount_refunded >= charge.amount
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;
    if (payment.status !== desiredStatus) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: desiredStatus },
      });
    }
  }
}
