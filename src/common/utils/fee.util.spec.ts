import { applyServiceFee, getFeeBreakdown } from './fee.util';

describe('fee.util', () => {
  it('applies the 10% markup exactly for clean values', () => {
    expect(applyServiceFee(100)).toBe(110);
    expect(applyServiceFee(50)).toBe(55);
  });

  it('rounds to the cent using Decimal arithmetic, not JS float math', () => {
    // Values chosen to exercise the multiply/round boundary -- Decimal
    // arithmetic keeps this exact where naive `tutorPrice * 1.1` float
    // math can drift before rounding.
    expect(applyServiceFee(33.33)).toBe(36.66);
    expect(applyServiceFee(10.01)).toBe(11.01);
    expect(applyServiceFee(19.99)).toBe(21.99);
  });

  it('getFeeBreakdown reverses applyServiceFee for whole-cent tutor prices', () => {
    for (const tutorPrice of [1, 9.99, 33.33, 100, 250.5, 999.01]) {
      const totalPrice = applyServiceFee(tutorPrice);
      const { tutorTotal, serviceFee } = getFeeBreakdown(totalPrice);
      expect(tutorTotal).toBeCloseTo(tutorPrice, 2);
      // The two halves must always reconstitute the stored total exactly
      // -- this is the invariant a future payout/refund flow will rely on.
      expect(Math.round((tutorTotal + serviceFee) * 100) / 100).toBe(totalPrice);
    }
  });

  it('serviceFee is never negative and never exceeds totalPrice', () => {
    for (const totalPrice of [0.01, 1, 55, 110, 100000]) {
      const { tutorTotal, serviceFee } = getFeeBreakdown(totalPrice);
      expect(serviceFee).toBeGreaterThanOrEqual(0);
      expect(tutorTotal).toBeGreaterThanOrEqual(0);
      expect(tutorTotal).toBeLessThanOrEqual(totalPrice);
    }
  });
});
