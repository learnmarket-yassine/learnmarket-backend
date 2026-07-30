import { Test, TestingModule } from '@nestjs/testing';
import { PayoutStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PayoutsService } from './payouts.service';
import { PayoutsReconciliationCron } from './payouts-reconciliation.cron';

describe('PayoutsReconciliationCron', () => {
  let cron: PayoutsReconciliationCron;
  let prisma: { payout: { findMany: jest.Mock } };
  let payoutsService: { releasePayout: jest.Mock };

  beforeEach(async () => {
    prisma = { payout: { findMany: jest.fn() } };
    payoutsService = { releasePayout: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsReconciliationCron,
        { provide: PrismaService, useValue: prisma },
        { provide: PayoutsService, useValue: payoutsService },
      ],
    }).compile();

    cron = moduleRef.get(PayoutsReconciliationCron);
  });

  it('retries every Payout stuck at PENDING past the age threshold', async () => {
    prisma.payout.findMany.mockResolvedValue([
      { id: 'payout-1' },
      { id: 'payout-2' },
    ]);

    await cron.retryStuckPayouts();

    expect(prisma.payout.findMany).toHaveBeenCalledWith({
      where: {
        status: PayoutStatus.PENDING,
        triggeredAt: { lt: expect.any(Date) },
      },
    });
    expect(payoutsService.releasePayout).toHaveBeenCalledWith('payout-1');
    expect(payoutsService.releasePayout).toHaveBeenCalledWith('payout-2');
  });

  it('swallows errors so one bad run does not crash the scheduler', async () => {
    prisma.payout.findMany.mockRejectedValue(new Error('db down'));
    await expect(cron.retryStuckPayouts()).resolves.toBeUndefined();
  });
});
