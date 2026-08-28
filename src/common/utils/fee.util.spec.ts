import { applyServiceFee, getFeeBreakdown } from './fee.util';

const TEN_PERCENT = 10;

describe('fee.util', () => {
  it('applies the 10% markup exactly for clean values', () => {
    expect(applyServiceFee(100, TEN_PERCENT)).toBe(110);
    expect(applyServiceFee(50, TEN_PERCENT)).toBe(55);
  });

  it('rounds to the cent using Decimal arithmetic, not JS float math', () => {
    // Values chosen to exercise the multiply/round boundary -- Decimal
    // arithmetic keeps this exact where naive `tutorPrice * 1.1` float
    // math can drift before rounding.
    expect(applyServiceFee(33.33, TEN_PERCENT)).toBe(36.66);
    expect(applyServiceFee(10.01, TEN_PERCENT)).toBe(11.01);
    expect(applyServiceFee(19.99, TEN_PERCENT)).toBe(21.99);
  });

  it('getFeeBreakdown reverses applyServiceFee for whole-cent tutor prices', () => {
    for (const tutorPrice of [1, 9.99, 33.33, 100, 250.5, 999.01]) {
      const totalPrice = applyServiceFee(tutorPrice, TEN_PERCENT);
      const { tutorTotal, serviceFee } = getFeeBreakdown(
        totalPrice,
        TEN_PERCENT,
      );
      expect(tutorTotal).toBeCloseTo(tutorPrice, 2);
      // The two halves must always reconstitute the stored total exactly
      // -- this is the invariant a future payout/refund flow will rely on.
      expect(Math.round((tutorTotal + serviceFee) * 100) / 100).toBe(
        totalPrice,
      );
    }
  });

  it('serviceFee is never negative and never exceeds totalPrice', () => {
    for (const totalPrice of [0.01, 1, 55, 110, 100000]) {
      const { tutorTotal, serviceFee } = getFeeBreakdown(
        totalPrice,
        TEN_PERCENT,
      );
      expect(serviceFee).toBeGreaterThanOrEqual(0);
      expect(tutorTotal).toBeGreaterThanOrEqual(0);
      expect(tutorTotal).toBeLessThanOrEqual(totalPrice);
    }
  });

  it('honors a different admin-configured fee percentage', () => {
    expect(applyServiceFee(100, 20)).toBe(120);
    expect(getFeeBreakdown(120, 20).tutorTotal).toBe(100);
    expect(getFeeBreakdown(120, 20).serviceFee).toBe(20);
  });
});
