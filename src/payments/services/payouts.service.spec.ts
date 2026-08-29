import { Test, TestingModule } from '@nestjs/testing';
import { PayoutStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { StripeService } from './stripe.service';
import { PayoutsService } from './payouts.service';

describe('PayoutsService', () => {
  let service: PayoutsService;
  let stripe: { createTransfer: jest.Mock };
  // Matches the 10% platform default (PlatformSettings.serviceFeePercent)
  // the fixtures below assume -- e.g. totalPrice 110 -> tutorTotal 100.
  const platformSettings = {
    getSettings: jest
      .fn()
      .mockResolvedValue({ proposalSparksCost: 4, serviceFeePercent: 10 }),
  };
  let tx: {
    payout: { create: jest.Mock; aggregate: jest.Mock };
    session: { count: jest.Mock };
    tutorProfile: { findUnique: jest.Mock };
  };

  const tutorId = 'tutor-1';
  const paymentId = 'payment-1';

  beforeEach(async () => {
    stripe = { createTransfer: jest.fn() };
    tx = {
      payout: { create: jest.fn(), aggregate: jest.fn() },
      session: { count: jest.fn() },
      tutorProfile: { findUnique: jest.fn() },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: PrismaService, useValue: {} },
        { provide: StripeService, useValue: stripe },
        { provide: PlatformSettingsService, useValue: platformSettings },
      ],
    }).compile();

    service = moduleRef.get(PayoutsService);
  });

  function session(
    overrides: Partial<{
      tutorJoinedAt: Date | null;
      sessionNumber: number;
    }> = {},
  ) {
    return {
      id: 'session-1',
      tutorJoinedAt: new Date(),
      sessionNumber: 1,
      ...overrides,
    } as any;
  }

  function proposal(
    overrides: Partial<{
      payoutMethod: string;
      totalPrice: Prisma.Decimal;
    }> = {},
  ) {
    return {
      id: 'proposal-1',
      tutorId,
      totalPrice: new Prisma.Decimal(110), // fee-inclusive: tutorTotal = 100
      payoutMethod: 'ON_COMPLETION',
      ...overrides,
    } as any;
  }

  function payment() {
    return { id: paymentId, currency: 'usd' } as any;
  }

  describe('recordPayoutForCompletedSession', () => {
    it('creates a HELD_FOR_REVIEW payout with amount 0 and does not release when the tutor never joined (no-show guard)', async () => {
      const result = await service.recordPayoutForCompletedSession(
        tx as any,
        session({ tutorJoinedAt: null }),
        proposal(),
        payment(),
      );

      expect(result).toBeNull();
      expect(tx.payout.create).toHaveBeenCalledWith({
        data: {
          paymentId,
          sessionId: 'session-1',
          tutorId,
          amount: 0,
          status: PayoutStatus.HELD_FOR_REVIEW,
        },
      });
      expect(tx.session.count).not.toHaveBeenCalled();
    });

    it('ON_COMPLETION: pays nothing until the final session, then pays the full tutor-net total in one payout', async () => {
      tx.session.count.mockResolvedValue(3);

      const notFinal = await service.recordPayoutForCompletedSession(
        tx as any,
        session({ sessionNumber: 2 }),
        proposal({ payoutMethod: 'ON_COMPLETION' }),
        payment(),
      );
      expect(notFinal).toBeNull();
      expect(tx.payout.create).not.toHaveBeenCalled();

      tx.payout.aggregate.mockResolvedValue({ _sum: { amount: null } });
      tx.tutorProfile.findUnique.mockResolvedValue({
        stripePayoutsEnabled: true,
        stripeAccountId: 'acct_1',
      });
      tx.payout.create.mockResolvedValue({ id: 'payout-1' });

      const final = await service.recordPayoutForCompletedSession(
        tx as any,
        session({ sessionNumber: 3 }),
        proposal({ payoutMethod: 'ON_COMPLETION' }),
        payment(),
      );

      expect(tx.payout.create).toHaveBeenCalledWith({
        data: {
          paymentId,
          sessionId: 'session-1',
          tutorId,
          amount: 100, // de-inflated tutor share of the 110 fee-inclusive total
          status: PayoutStatus.PENDING,
        },
      });
      expect(final).toEqual({ payoutId: 'payout-1', shouldRelease: true });
    });

    it('PER_SESSION: computes the cumulative-difference share for the given session number', async () => {
      tx.session.count.mockResolvedValue(3);
      tx.tutorProfile.findUnique.mockResolvedValue({
        stripePayoutsEnabled: true,
        stripeAccountId: 'acct_1',
      });
      tx.payout.create.mockResolvedValue({ id: 'payout-1' });

      await service.recordPayoutForCompletedSession(
        tx as any,
        session({ sessionNumber: 1 }),
        proposal({ payoutMethod: 'PER_SESSION' }),
        payment(),
      );

      // tutorTotal=100 over 3 sessions -> session 1 share is 33.33
      expect(tx.payout.create).toHaveBeenCalledWith({
        data: {
          paymentId,
          sessionId: 'session-1',
          tutorId,
          amount: 33.33,
          status: PayoutStatus.PENDING,
        },
      });
    });

    it('creates PENDING_ONBOARDING (not PENDING) and shouldRelease:false when the tutor cannot yet receive transfers', async () => {
      tx.session.count.mockResolvedValue(1);
      tx.tutorProfile.findUnique.mockResolvedValue({
        stripePayoutsEnabled: false,
        stripeAccountId: null,
      });
      tx.payout.create.mockResolvedValue({ id: 'payout-1' });

      const result = await service.recordPayoutForCompletedSession(
        tx as any,
        session({ sessionNumber: 1 }),
        proposal({ payoutMethod: 'PER_SESSION' }),
        payment(),
      );

      expect(tx.payout.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PayoutStatus.PENDING_ONBOARDING,
          }),
        }),
      );
      expect(result).toEqual({ payoutId: 'payout-1', shouldRelease: false });
    });
  });

  describe('releasePayout', () => {
    it('is a no-op when the payout is already RELEASED', async () => {
      const prisma = { payout: { findUniqueOrThrow: jest.fn() } };
      const moduleRef = await Test.createTestingModule({
        providers: [
          PayoutsService,
          { provide: PrismaService, useValue: prisma },
          { provide: StripeService, useValue: stripe },
          { provide: PlatformSettingsService, useValue: platformSettings },
        ],
      }).compile();
      const svc = moduleRef.get(PayoutsService);

      prisma.payout.findUniqueOrThrow.mockResolvedValue({
        id: 'payout-1',
        status: PayoutStatus.RELEASED,
      });

      await svc.releasePayout('payout-1');
      expect(stripe.createTransfer).not.toHaveBeenCalled();
    });
  });
});
