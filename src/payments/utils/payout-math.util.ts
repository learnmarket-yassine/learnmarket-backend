import { Prisma } from '@prisma/client';

/**
 * Cumulative-difference technique: the amount payable "through" session N is
 * always recomputed from the full total rather than accumulated session by
 * session, so the sum across every session lands on exactly `totalPrice`
 * regardless of how unevenly it divides. Never use Math.round(x*100)/100 for
 * this -- Decimal only, this is money math.
 */
export function amountThroughSession(
  totalPrice: Prisma.Decimal,
  sessionsCompleted: number,
  totalSessions: number,
): Prisma.Decimal {
  return totalPrice
    .times(sessionsCompleted)
    .dividedBy(totalSessions)
    .toDecimalPlaces(2);
}

export function sessionPayoutAmount(
  totalPrice: Prisma.Decimal,
  sessionNumber: number,
  totalSessions: number,
): Prisma.Decimal {
  return amountThroughSession(totalPrice, sessionNumber, totalSessions).minus(
    amountThroughSession(totalPrice, sessionNumber - 1, totalSessions),
  );
}
