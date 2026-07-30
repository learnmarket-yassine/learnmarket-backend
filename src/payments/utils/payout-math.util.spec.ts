import { Prisma } from '@prisma/client';
import { amountThroughSession, sessionPayoutAmount } from './payout-math.util';

function sumPerSession(
  totalPrice: number,
  totalSessions: number,
): Prisma.Decimal {
  let sum = new Prisma.Decimal(0);
  for (let n = 1; n <= totalSessions; n++) {
    sum = sum.plus(
      sessionPayoutAmount(new Prisma.Decimal(totalPrice), n, totalSessions),
    );
  }
  return sum;
}

describe('payout-math.util', () => {
  it('splits a non-dividing total (100 / 3) so the sum is exactly the total, no floating point drift', () => {
    const total = new Prisma.Decimal(100);
    const amounts = [1, 2, 3].map((n) => sessionPayoutAmount(total, n, 3));

    expect(amounts[0].toNumber()).toBe(33.33);
    expect(amounts[1].toNumber()).toBe(33.34);
    expect(amounts[2].toNumber()).toBe(33.33);

    const sum = amounts.reduce((acc, a) => acc.plus(a), new Prisma.Decimal(0));
    expect(sum.equals(total)).toBe(true);
  });

  it('sums to exactly the total across a range of totals/session counts that do not divide evenly', () => {
    const cases: Array<[number, number]> = [
      [100, 3],
      [50, 7],
      [99.99, 4],
      [10, 6],
      [0.01, 3],
    ];
    for (const [totalPrice, totalSessions] of cases) {
      const sum = sumPerSession(totalPrice, totalSessions);
      expect(sum.equals(new Prisma.Decimal(totalPrice))).toBe(true);
    }
  });

  it('amountThroughSession(total, 0, n) is always zero and (total, n, n) is always the full total', () => {
    const total = new Prisma.Decimal(150.5);
    expect(amountThroughSession(total, 0, 4).toNumber()).toBe(0);
    expect(amountThroughSession(total, 4, 4).equals(total)).toBe(true);
  });

  it('a single-session proposal pays the full amount in one go', () => {
    const total = new Prisma.Decimal(75.25);
    expect(sessionPayoutAmount(total, 1, 1).equals(total)).toBe(true);
  });
});
