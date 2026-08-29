import { Prisma } from '@prisma/client';

export interface FeeBreakdown {
  serviceFee: number;
  tutorTotal: number;
}

function feeMultiplier(
  serviceFeePercent: Prisma.Decimal | number,
): Prisma.Decimal {
  return new Prisma.Decimal(1).plus(
    new Prisma.Decimal(serviceFeePercent).dividedBy(100),
  );
}

export function applyServiceFee(
  tutorPrice: number,
  serviceFeePercent: Prisma.Decimal | number,
): number {
  return new Prisma.Decimal(tutorPrice)
    .times(feeMultiplier(serviceFeePercent))
    .toDecimalPlaces(2)
    .toNumber();
}

export function getFeeBreakdown(
  totalPrice: number,
  serviceFeePercent: Prisma.Decimal | number,
): FeeBreakdown {
  const total = new Prisma.Decimal(totalPrice);
  const multiplier = feeMultiplier(serviceFeePercent);
  const tutorTotal = total.dividedBy(multiplier).toDecimalPlaces(2);
  const serviceFee = total.minus(tutorTotal).toDecimalPlaces(2);
  return {
    tutorTotal: tutorTotal.toNumber(),
    serviceFee: serviceFee.toNumber(),
  };
}
