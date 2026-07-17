import { BadRequestException, Injectable } from '@nestjs/common';
import { LearnRequestType } from '@prisma/client';

export interface PublishableLearnRequest {
  title: string;
  type: LearnRequestType | null;
  categoryId: string | null;
  level: string | null;
  preferredLanguages: string[];
  requestedFrequency: number | null;
  budgetMin: unknown;
  budgetMax: unknown;
  description: string | null;
  skills: unknown[];
}

const MAX_DESCRIPTION_LENGTH = 2000;

@Injectable()
export class LearnRequestValidationService {
  collectPublishErrors(learnRequest: PublishableLearnRequest): string[] {
    const errors: string[] = [];

    if (!learnRequest.title?.trim()) errors.push('title is required');
    if (!learnRequest.type) errors.push('type is required');
    if (!learnRequest.categoryId) errors.push('categoryId is required');
    if (!learnRequest.skills?.length) {
      errors.push('at least one skill is required');
    }
    if (!learnRequest.level) errors.push('level is required');
    if (!learnRequest.preferredLanguages?.length) {
      errors.push('at least one preferred language is required');
    }

    if (learnRequest.type === LearnRequestType.COURSE) {
      if (learnRequest.requestedFrequency == null) {
        errors.push('requestedFrequency is required for COURSE requests');
      }
    } else if (learnRequest.type === LearnRequestType.ONE_TIME) {
      if (learnRequest.requestedFrequency != null) {
        errors.push('requestedFrequency must be absent for ONE_TIME requests');
      }
    }

    const budgetMin =
      learnRequest.budgetMin != null ? Number(learnRequest.budgetMin) : null;
    const budgetMax =
      learnRequest.budgetMax != null ? Number(learnRequest.budgetMax) : null;

    if (budgetMin == null) errors.push('budgetMin is required');
    else if (budgetMin < 0) errors.push('budgetMin must be non-negative');

    if (budgetMax == null) errors.push('budgetMax is required');
    else if (budgetMax < 0) errors.push('budgetMax must be non-negative');

    if (budgetMin != null && budgetMax != null && budgetMax < budgetMin) {
      errors.push('budgetMax must be greater than or equal to budgetMin');
    }

    const description = learnRequest.description?.trim();
    if (!description) {
      errors.push('description is required');
    } else if (description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
      );
    }

    return errors;
  }

  assertPublishable(learnRequest: PublishableLearnRequest): void {
    const errors = this.collectPublishErrors(learnRequest);
    if (errors.length) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: errors,
      });
    }
  }
}
