import { Test, TestingModule } from '@nestjs/testing';
import { PaymentStatus, PayoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { DailyService } from '../../sessions/services/daily.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService.cancelAndRefund', () => {
  let service: PaymentsService;
  let stripe: { createRefund: jest.Mock };
  let prisma: {
    payment: { findUnique: jest.Mock; update: jest.Mock };
    payout: { updateMany: jest.Mock };
    refund: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  const proposalId = 'proposal-1';
  const paymentId = 'payment-1';

  beforeEach(async () => {
    stripe = { createRefund: jest.fn() };
    prisma = {
      payment: { findUnique: jest.fn(), update: jest.fn() },
      payout: { updateMany: jest.fn() },
      refund: { create: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeService, useValue: stripe },
        { provide: DailyService, useValue: { deleteRoom: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  function paymentWithPayouts(releasedCount: number, totalSessions: number) {
    const payouts = Array.from({ length: releasedCount }, (_, i) => ({
      id: `payout-${i}`,
      status: PayoutStatus.RELEASED,
    }));
    return {
      id: paymentId,
      proposalId,
      status: PaymentStatus.SUCCEEDED,
      amount: new Prisma.Decimal(150),
      stripePaymentIntentId: 'pi_1',
      payouts,
      proposal: {
        sessions: Array.from({ length: totalSessions }, (_, i) => ({
          id: `s${i}`,
        })),
      },
    };
  }

  it('does nothing when there is no Payment or it never succeeded', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);
    await service.cancelAndRefund(proposalId);
    expect(stripe.createRefund).not.toHaveBeenCalled();

    prisma.payment.findUnique.mockResolvedValue({
      status: PaymentStatus.PENDING,
    });
    await service.cancelAndRefund(proposalId);
    expect(stripe.createRefund).not.toHaveBeenCalled();
  });

  it('refunds the full amount when no session has been paid out yet', async () => {
    prisma.payment.findUnique.mockResolvedValue(paymentWithPayouts(0, 3));
    prisma.payout.updateMany.mockResolvedValue({ count: 0 });
    stripe.createRefund.mockResolvedValue({ id: 're_1' });

    await service.cancelAndRefund(proposalId, 'learner cancelled');

    expect(stripe.createRefund).toHaveBeenCalledWith(paymentId, 'pi_1', 15000); // 150.00 in cents
    expect(prisma.refund.create).toHaveBeenCalledWith({
      data: {
        paymentId,
        stripeRefundId: 're_1',
        amount: 150,
        reason: 'learner cancelled',
      },
    });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: { status: PaymentStatus.REFUNDED },
    });
  });

  it('refunds only the un-consumed portion (cumulative-difference math) and marks PARTIALLY_REFUNDED', async () => {
    // 150 total, 3 sessions, 1 already RELEASED -> consumed = amountThroughSession(150,1,3) = 50.00
    prisma.payment.findUnique.mockResolvedValue(paymentWithPayouts(1, 3));
    prisma.payout.updateMany.mockResolvedValue({ count: 0 });
    stripe.createRefund.mockResolvedValue({ id: 're_2' });

    await service.cancelAndRefund(proposalId);

    expect(stripe.createRefund).toHaveBeenCalledWith(paymentId, 'pi_1', 10000); // 100.00 refundable
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: { status: PaymentStatus.PARTIALLY_REFUNDED },
    });
  });

  it('cancels any still-PENDING/PENDING_ONBOARDING payouts so they never fire later', async () => {
    prisma.payment.findUnique.mockResolvedValue(paymentWithPayouts(0, 2));
    prisma.payout.updateMany.mockResolvedValue({ count: 2 });
    stripe.createRefund.mockResolvedValue({ id: 're_3' });

    await service.cancelAndRefund(proposalId);

    expect(prisma.payout.updateMany).toHaveBeenCalledWith({
      where: {
        paymentId,
        status: { in: [PayoutStatus.PENDING, PayoutStatus.PENDING_ONBOARDING] },
      },
      data: { status: PayoutStatus.CANCELLED },
    });
  });

  it('does not call Stripe when every session has already been paid out (nothing refundable)', async () => {
    prisma.payment.findUnique.mockResolvedValue(paymentWithPayouts(3, 3));
    prisma.payout.updateMany.mockResolvedValue({ count: 0 });

    await service.cancelAndRefund(proposalId);

    expect(stripe.createRefund).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });
});
