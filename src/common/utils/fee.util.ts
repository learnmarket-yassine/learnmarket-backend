import { Prisma } from '@prisma/client';

export const SERVICE_FEE_PERCENT = 0.1;

export interface FeeBreakdown {
  serviceFee: number;
  tutorTotal: number;
}

const FEE_MULTIPLIER = new Prisma.Decimal(1).plus(SERVICE_FEE_PERCENT);

export function applyServiceFee(tutorPrice: number): number {
  return new Prisma.Decimal(tutorPrice)
    .times(FEE_MULTIPLIER)
    .toDecimalPlaces(2)
    .toNumber();
}

export function getFeeBreakdown(totalPrice: number): FeeBreakdown {
  const total = new Prisma.Decimal(totalPrice);
  const tutorTotal = total.dividedBy(FEE_MULTIPLIER).toDecimalPlaces(2);
  const serviceFee = total.minus(tutorTotal).toDecimalPlaces(2);
  return {
    tutorTotal: tutorTotal.toNumber(),
    serviceFee: serviceFee.toNumber(),
  };
}
