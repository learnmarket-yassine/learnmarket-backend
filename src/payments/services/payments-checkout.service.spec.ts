import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService.createPaymentIntentForProposal', () => {
  let service: PaymentsService;
  let stripe: { createPaymentIntent: jest.Mock };
  let prisma: {
    proposal: { findUnique: jest.Mock };
    payment: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  const learnerId = 'learner-1';
  const proposalId = 'proposal-1';

  beforeEach(async () => {
    stripe = { createPaymentIntent: jest.fn() };
    prisma = {
      proposal: { findUnique: jest.fn() },
      payment: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeService, useValue: stripe },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  function openProposal() {
    return {
      id: proposalId,
      status: 'PENDING',
      totalPrice: new Prisma.Decimal(110),
      learnRequest: { learnerId, status: 'OPEN' },
    };
  }

  it('rejects a learner who does not own the learn request', async () => {
    prisma.proposal.findUnique.mockResolvedValue(openProposal());
    await expect(
      service.createPaymentIntentForProposal('someone-else', proposalId),
    ).rejects.toThrow(ForbiddenException);
  });

  it('404s on a missing proposal', async () => {
    prisma.proposal.findUnique.mockResolvedValue(null);
    await expect(
      service.createPaymentIntentForProposal(learnerId, proposalId),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects checkout on an already-paid proposal instead of creating a duplicate Payment', async () => {
    prisma.proposal.findUnique.mockResolvedValue(openProposal());
    prisma.payment.findUnique.mockResolvedValue({
      status: PaymentStatus.SUCCEEDED,
    });

    await expect(
      service.createPaymentIntentForProposal(learnerId, proposalId),
    ).rejects.toThrow(ConflictException);
    expect(stripe.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('a rapid double-click reuses the SAME Payment row instead of creating a second one, because Stripe returns the same idempotency-keyed PaymentIntent', async () => {
    prisma.proposal.findUnique.mockResolvedValue(openProposal());
    // First call: no Payment yet.
    prisma.payment.findUnique.mockResolvedValueOnce(null);
    stripe.createPaymentIntent.mockResolvedValue({
      id: 'pi_shared',
      client_secret: 'secret_1',
    });
    prisma.payment.create.mockResolvedValue({
      id: 'payment-1',
      stripePaymentIntentId: 'pi_shared',
      amount: new Prisma.Decimal(110),
      currency: 'usd',
    });

    const first = await service.createPaymentIntentForProposal(
      learnerId,
      proposalId,
    );
    expect(prisma.payment.create).toHaveBeenCalledTimes(1);

    // Second call (the "double click"): Payment row now exists with the
    // same PaymentIntent id Stripe's idempotency key produced again.
    prisma.payment.findUnique.mockResolvedValueOnce({
      id: 'payment-1',
      status: PaymentStatus.PENDING,
      stripePaymentIntentId: 'pi_shared',
      amount: new Prisma.Decimal(110),
      currency: 'usd',
    });

    const second = await service.createPaymentIntentForProposal(
      learnerId,
      proposalId,
    );

    expect(prisma.payment.create).toHaveBeenCalledTimes(1); // still just once
    expect(prisma.payment.update).not.toHaveBeenCalled(); // PI id didn't change, no update needed
    expect(second.paymentIntentId).toBe(first.paymentIntentId);
  });

  it('re-points the Payment row at a new PaymentIntent if Stripe issued a genuinely different one (idempotency key expired)', async () => {
    prisma.proposal.findUnique.mockResolvedValue(openProposal());
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.FAILED,
      stripePaymentIntentId: 'pi_old',
      amount: new Prisma.Decimal(110),
      currency: 'usd',
    });
    stripe.createPaymentIntent.mockResolvedValue({
      id: 'pi_new',
      client_secret: 'secret_new',
    });
    prisma.payment.update.mockResolvedValue({
      id: 'payment-1',
      stripePaymentIntentId: 'pi_new',
      amount: new Prisma.Decimal(110),
      currency: 'usd',
    });

    const result = await service.createPaymentIntentForProposal(
      learnerId,
      proposalId,
    );

    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { stripePaymentIntentId: 'pi_new' },
    });
    expect(result.paymentIntentId).toBe('pi_new');
  });
});
