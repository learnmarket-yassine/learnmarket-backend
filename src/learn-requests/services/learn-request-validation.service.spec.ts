import { LearnRequestType } from '@prisma/client';
import {
  LearnRequestValidationService,
  PublishableLearnRequest,
} from './learn-request-validation.service';

function validRequest(
  overrides: Partial<PublishableLearnRequest> = {},
): PublishableLearnRequest {
  return {
    title: 'Learn French',
    type: LearnRequestType.ONE_TIME,
    categoryId: 'cat-1',
    level: 'BEGINNER',
    preferredLanguages: ['English'],
    requestedFrequency: null,
    budgetMin: 10,
    budgetMax: 20,
    description: 'I want to learn French for my upcoming trip.',
    skills: [{ id: 'skill-1' }],
    ...overrides,
  };
}

describe('LearnRequestValidationService', () => {
  const service = new LearnRequestValidationService();

  it('passes a fully valid ONE_TIME request with no requestedFrequency', () => {
    expect(service.collectPublishErrors(validRequest())).toEqual([]);
  });

  it('passes a fully valid COURSE request with a requestedFrequency', () => {
    const errors = service.collectPublishErrors(
      validRequest({
        type: LearnRequestType.COURSE,
        requestedFrequency: 2,
      }),
    );
    expect(errors).toEqual([]);
  });

  it('reports every missing field at once, not just the first', () => {
    const errors = service.collectPublishErrors({
      title: '',
      type: null,
      categoryId: null,
      level: null,
      preferredLanguages: [],
      requestedFrequency: null,
      budgetMin: null,
      budgetMax: null,
      description: null,
      skills: [],
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'title is required',
        'type is required',
        'categoryId is required',
        'at least one skill is required',
        'level is required',
        'at least one preferred language is required',
        'budgetMin is required',
        'budgetMax is required',
        'description is required',
      ]),
    );
  });

  it('requires requestedFrequency for COURSE requests', () => {
    const errors = service.collectPublishErrors(
      validRequest({ type: LearnRequestType.COURSE, requestedFrequency: null }),
    );
    expect(errors).toContain(
      'requestedFrequency is required for COURSE requests',
    );
  });

  it('rejects a requestedFrequency on ONE_TIME requests', () => {
    const errors = service.collectPublishErrors(
      validRequest({
        type: LearnRequestType.ONE_TIME,
        requestedFrequency: 3,
      }),
    );
    expect(errors).toContain(
      'requestedFrequency must be absent for ONE_TIME requests',
    );
  });

  it('rejects negative budgets', () => {
    const errors = service.collectPublishErrors(
      validRequest({ budgetMin: -5, budgetMax: 10 }),
    );
    expect(errors).toContain('budgetMin must be non-negative');
  });

  it('rejects budgetMax below budgetMin', () => {
    const errors = service.collectPublishErrors(
      validRequest({ budgetMin: 50, budgetMax: 10 }),
    );
    expect(errors).toContain(
      'budgetMax must be greater than or equal to budgetMin',
    );
  });

  it('accepts budgetMax equal to budgetMin', () => {
    const errors = service.collectPublishErrors(
      validRequest({ budgetMin: 25, budgetMax: 25 }),
    );
    expect(errors).toEqual([]);
  });

  it('rejects a description over 2000 characters', () => {
    const errors = service.collectPublishErrors(
      validRequest({ description: 'a'.repeat(2001) }),
    );
    expect(errors).toContain('description must be at most 2000 characters');
  });

  it('rejects a description that is only whitespace', () => {
    const errors = service.collectPublishErrors(
      validRequest({ description: '   ' }),
    );
    expect(errors).toContain('description is required');
  });

  it('throws BadRequestException with every failing field when asserting', () => {
    expect(() =>
      service.assertPublishable(validRequest({ level: null })),
    ).toThrow();
  });
});
