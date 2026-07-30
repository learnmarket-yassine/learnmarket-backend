import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubmitFeedbackDto } from './submit-feedback.dto';

describe('SubmitFeedbackDto rating validation', () => {
  function dto(rating: number) {
    return plainToInstance(SubmitFeedbackDto, { rating });
  }

  it.each([1, 2, 3, 4, 5])('accepts a rating of %i', async (rating) => {
    const errors = await validate(dto(rating));
    expect(errors.find((e) => e.property === 'rating')).toBeUndefined();
  });

  it('rejects a rating below 1', async () => {
    const errors = await validate(dto(0));
    const ratingError = errors.find((e) => e.property === 'rating');
    expect(ratingError?.constraints).toHaveProperty('min');
  });

  it('rejects a rating above 5', async () => {
    const errors = await validate(dto(6));
    const ratingError = errors.find((e) => e.property === 'rating');
    expect(ratingError?.constraints).toHaveProperty('max');
  });
});
