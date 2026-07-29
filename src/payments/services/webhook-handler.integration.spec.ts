import { Test, TestingModule } from '@nestjs/testing';
import {
  LearnRequestStatus,
  PaymentStatus,
  ProposalStatus,
  SessionStatus,
  TutorVerificationStatus,
} from '@prisma/client';
import type Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../../messaging/services/messaging.service';
import { ProposalsService } from '../../proposals/services/proposals.service';
import { StripeService } from './stripe.service';
import { PayoutsService } from './payouts.service';
import { WebhookHandlerService } from './webhook-handler.service';
import { PaymentsGateway } from '../gateways/payments.gateway';

function fakeEvent(id: string, type: string, object: unknown): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

describe('WebhookHandlerService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let webhookHandler: WebhookHandlerService;

  let tutorId: string;
  let learnerId: string;
  let categoryId: string;
  let learnRequestId: string;
  let proposalId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        ProposalsService,
        PayoutsService,
        WebhookHandlerService,
        {
          provide: MessagingService,
          useValue: { recomputeConversationActiveState: jest.fn() },
        },
        { provide: StripeService, useValue: { createTransfer: jest.fn() } },
        {
          provide: PaymentsGateway,
          useValue: { emitProposalAccepted: jest.fn() },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    webhookHandler = moduleRef.get(WebhookHandlerService);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const [tutor, learner, category] = await Promise.all([
      prisma.user.create({
        data: {
          email: `tutor-${suffix}@test.local`,
          password: 'x',
          firstname: 'T',
          lastname: 'Tutor',
          role: 'TUTOR',
        },
      }),
      prisma.user.create({
        data: {
          email: `learner-${suffix}@test.local`,
          password: 'x',
          firstname: 'L',
          lastname: 'Learner',
          role: 'LEARNER',
        },
      }),
      prisma.category.create({
        data: { name: `Category ${suffix}`, slug: `category-${suffix}` },
      }),
    ]);
    tutorId = tutor.id;
    learnerId = learner.id;
    categoryId = category.id;

    await prisma.tutorProfile.create({
      data: {
        userId: tutorId,
        verificationStatus: TutorVerificationStatus.APPROVED,
      },
    });

    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title: 'One-time request',
        status: LearnRequestStatus.OPEN,
        categoryId,
      },
    });
    learnRequestId = learnRequest.id;

    const proposal = await prisma.proposal.create({
      data: {
        learnRequestId,
        tutorId,
        sessionDurationMinutes: 60,
        totalPrice: 110,
        sessionPlans: { create: [{ sessionNumber: 1, title: 'Session 1' }] },
      },
    });
    proposalId = proposal.id;
  });

  afterEach(async () => {
    await prisma.stripeWebhookEvent.deleteMany({});
    await prisma.learnRequest.deleteMany({ where: { learnerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, learnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  async function createPayment(stripePaymentIntentId: string) {
    return prisma.payment.create({
      data: {
        proposalId,
        learnerId,
        stripePaymentIntentId,
        amount: 110,
        currency: 'usd',
        status: PaymentStatus.PENDING,
      },
    });
  }

  it('payment_intent.succeeded: marks Payment SUCCEEDED and runs the accept transaction exactly once, even when the SAME event is redelivered', async () => {
    const piId = `pi_${proposalId}`;
    await createPayment(piId);
    const event = fakeEvent(`evt_${proposalId}`, 'payment_intent.succeeded', {
      id: piId,
    });

    await webhookHandler.handle(event);
    await webhookHandler.handle(event); // simulated Stripe redelivery of the identical event

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { proposalId },
    });
    expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(payment.succeededAt).not.toBeNull();

    const proposal = await prisma.proposal.findUniqueOrThrow({
      where: { id: proposalId },
    });
    expect(proposal.status).toBe(ProposalStatus.ACCEPTED);

    const learnRequest = await prisma.learnRequest.findUniqueOrThrow({
      where: { id: learnRequestId },
    });
    expect(learnRequest.status).toBe(LearnRequestStatus.CLOSED);

    const sessions = await prisma.session.findMany({ where: { proposalId } });
    expect(sessions).toHaveLength(1); // not duplicated by the redelivery
    expect(sessions[0].status).toBe(SessionStatus.PENDING_SCHEDULE);

    const webhookEvents = await prisma.stripeWebhookEvent.findMany({
      where: { id: `evt_${proposalId}` },
    });
    expect(webhookEvents).toHaveLength(1);
  });

  it('payment_intent.payment_failed: marks Payment FAILED and leaves the Proposal untouched at PENDING', async () => {
    const piId = `pi_${proposalId}`;
    await createPayment(piId);
    const event = fakeEvent(
      `evt_fail_${proposalId}`,
      'payment_intent.payment_failed',
      { id: piId },
    );

    await webhookHandler.handle(event);

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { proposalId },
    });
    expect(payment.status).toBe(PaymentStatus.FAILED);

    const proposal = await prisma.proposal.findUniqueOrThrow({
      where: { id: proposalId },
    });
    expect(proposal.status).toBe(ProposalStatus.PENDING);

    const sessions = await prisma.session.findMany({ where: { proposalId } });
    expect(sessions).toHaveLength(0);
  });

  it('charge.refunded self-heals: creates the Refund row and recomputes Payment.status even if our own cancelAndRefund never got to record it', async () => {
    const piId = `pi_${proposalId}`;
    await prisma.payment.update({
      where: { id: (await createPayment(piId)).id },
      data: { status: PaymentStatus.SUCCEEDED, succeededAt: new Date() },
    });

    const chargeEvent = fakeEvent(
      `evt_refund_${proposalId}`,
      'charge.refunded',
      {
        payment_intent: piId,
        amount: 11000,
        amount_refunded: 5000,
        refunds: {
          data: [
            {
              id: `re_${proposalId}`,
              amount: 5000,
              reason: 'requested_by_customer',
            },
          ],
        },
      },
    );

    await webhookHandler.handle(chargeEvent);

    const refund = await prisma.refund.findUnique({
      where: { stripeRefundId: `re_${proposalId}` },
    });
    expect(refund).not.toBeNull();
    expect(Number(refund!.amount)).toBe(50);

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { proposalId },
    });
    expect(payment.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);

    // Redelivery of the same event must not create a second Refund row for
    // the same stripeRefundId.
    await webhookHandler.handle(
      fakeEvent(`evt_refund_2_${proposalId}`, 'charge.refunded', {
        payment_intent: piId,
        amount: 11000,
        amount_refunded: 5000,
        refunds: {
          data: [
            {
              id: `re_${proposalId}`,
              amount: 5000,
              reason: 'requested_by_customer',
            },
          ],
        },
      }),
    );
    const refunds = await prisma.refund.findMany({
      where: { paymentId: payment.id },
    });
    expect(refunds).toHaveLength(1);
  });

  it('an unrecognized event type is acknowledged and recorded without throwing', async () => {
    const event = fakeEvent(
      `evt_unknown_${proposalId}`,
      'some.unhandled.event',
      {},
    );
    await expect(webhookHandler.handle(event)).resolves.toEqual({
      received: true,
    });

    const recorded = await prisma.stripeWebhookEvent.findUnique({
      where: { id: `evt_unknown_${proposalId}` },
    });
    expect(recorded).not.toBeNull();
  });
});
