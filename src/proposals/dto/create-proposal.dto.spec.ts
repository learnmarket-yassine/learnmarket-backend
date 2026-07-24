import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProposalDto, MAX_PROPOSAL_PRICE } from './create-proposal.dto';

describe('CreateProposalDto totalPrice validation', () => {
  function dto(totalPrice: number) {
    return plainToInstance(CreateProposalDto, {
      sessionDurationMinutes: 60,
      totalPrice,
      sessionPlans: [{ title: 'Session 1' }],
    });
  }

  it('accepts a price within the sanity cap', async () => {
    const errors = await validate(dto(MAX_PROPOSAL_PRICE));
    expect(errors.find((e) => e.property === 'totalPrice')).toBeUndefined();
  });

  it('rejects a price above the sanity cap', async () => {
    const errors = await validate(dto(MAX_PROPOSAL_PRICE + 1));
    const priceError = errors.find((e) => e.property === 'totalPrice');
    expect(priceError).toBeDefined();
    expect(priceError?.constraints).toHaveProperty('max');
  });

  it('still rejects zero/negative prices', async () => {
    const errors = await validate(dto(0));
    const priceError = errors.find((e) => e.property === 'totalPrice');
    expect(priceError?.constraints).toHaveProperty('isPositive');
  });
});
