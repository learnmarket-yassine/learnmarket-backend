import { Prisma } from '@prisma/client';

/** Stripe amounts are always integer minor units (cents for USD). */
export function toCents(amount: Prisma.Decimal | number): number {
  const decimal =
    amount instanceof Prisma.Decimal ? amount : new Prisma.Decimal(amount);
  return decimal.times(100).toDecimalPlaces(0).toNumber();
}
