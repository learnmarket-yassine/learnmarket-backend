import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedbackService, HiddenFeedback } from './feedback.service';
import { REVEAL_FALLBACK_DAYS } from '../constants/feedback.constants';

describe('FeedbackService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let feedback: FeedbackService;

  let tutorId: string;
  let learnerId: string;
  let outsiderId: string;
  let categoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [PrismaService, FeedbackService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    feedback = moduleRef.get(FeedbackService);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [tutor, learner, outsider, category] = await Promise.all([
      prisma.user.create({
        data: {
          email: `tutor-${suffix}@test.local`,
          password: 'x',
          firstname: 'T',
          lastname: 'Tutor',
          role: 'TUTOR',
        },
      }),
      prisma.user.create({
        data: {
          email: `learner-${suffix}@test.local`,
          password: 'x',
          firstname: 'L',
          lastname: 'Learner',
          role: 'LEARNER',
        },
      }),
      prisma.user.create({
        data: {
          email: `outsider-${suffix}@test.local`,
          password: 'x',
          firstname: 'O',
          lastname: 'Outsider',
          role: 'LEARNER',
        },
      }),
      prisma.category.create({
        data: { name: `Category ${suffix}`, slug: `category-${suffix}` },
      }),
    ]);
    tutorId = tutor.id;
    learnerId = learner.id;
    outsiderId = outsider.id;
    categoryId = category.id;
  });

  afterEach(async () => {
    await prisma.learnRequest.deleteMany({ where: { learnerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, learnerId, outsiderId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  async function createProposal(opts: {
    learnRequestStatus: 'OPEN' | 'CLOSED' | 'COMPLETED';
    proposalStatus: 'PENDING' | 'ACCEPTED';
    completedAt?: Date | null;
  }) {
    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title: 'Course request',
        status: opts.learnRequestStatus,
        completedAt: opts.completedAt ?? null,
        categoryId,
      },
    });
    const proposal = await prisma.proposal.create({
      data: {
        learnRequestId: learnRequest.id,
        tutorId,
        sessionDurationMinutes: 60,
        totalPrice: 50,
        status: opts.proposalStatus,
      },
    });
    return { learnRequest, proposal };
  }

  async function completedProposal(completedAt: Date = new Date()) {
    return createProposal({
      learnRequestStatus: 'COMPLETED',
      proposalStatus: 'ACCEPTED',
      completedAt,
    });
  }

  describe('submitFeedback eligibility', () => {
    it('rejects submission when the course is not COMPLETED yet, even if the proposal is ACCEPTED', async () => {
      const { proposal } = await createProposal({
        learnRequestStatus: 'OPEN',
        proposalStatus: 'ACCEPTED',
      });

      await expect(
        feedback.submitFeedback(learnerId, proposal.id, { rating: 5 }),
      ).rejects.toThrow(ConflictException);
    });

    it('404s a non-participant attempting to submit', async () => {
      const { proposal } = await completedProposal();

      await expect(
        feedback.submitFeedback(outsiderId, proposal.id, { rating: 5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns a clean 409 on a duplicate submission by the same author', async () => {
      const { proposal } = await completedProposal();

      await feedback.submitFeedback(learnerId, proposal.id, {
        rating: 4,
        comment: 'Great!',
      });

      await expect(
        feedback.submitFeedback(learnerId, proposal.id, { rating: 5 }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows both the tutor and the learner to submit once the course is COMPLETED', async () => {
      const { proposal } = await completedProposal();

      const learnerFeedback = await feedback.submitFeedback(
        learnerId,
        proposal.id,
        { rating: 5, comment: 'Awesome tutor' },
      );
      const tutorFeedback = await feedback.submitFeedback(
        tutorId,
        proposal.id,
        { rating: 4, comment: 'Diligent learner' },
      );

      expect(learnerFeedback.aboutUserId).toBe(tutorId);
      expect(tutorFeedback.aboutUserId).toBe(learnerId);
    });
  });

  describe('getFeedbackForProposal double-blind reveal', () => {
    it('404s a non-participant attempting to read', async () => {
      const { proposal } = await completedProposal();
      await feedback.submitFeedback(learnerId, proposal.id, { rating: 5 });

      await expect(
        feedback.getFeedbackForProposal(outsiderId, proposal.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('hides the other party rating/comment from the raw response until both submit, but always shows the viewer their own', async () => {
      const { proposal } = await completedProposal();
      await feedback.submitFeedback(learnerId, proposal.id, {
        rating: 2,
        comment: 'super secret learner opinion',
      });

      const tutorView = await feedback.getFeedbackForProposal(
        tutorId,
        proposal.id,
      );
      expect(tutorView).toHaveLength(1);
      const hidden = tutorView[0] as HiddenFeedback;
      expect(hidden.status).toBe('hidden');
      expect(hidden).not.toHaveProperty('rating');
      expect(hidden).not.toHaveProperty('comment');
      expect(JSON.stringify(tutorView)).not.toContain('super secret');
      expect(JSON.stringify(tutorView)).not.toContain('"rating"');

      // The learner viewing their OWN feedback always sees it, even though
      // the tutor hasn't submitted yet.
      const learnerView = await feedback.getFeedbackForProposal(
        learnerId,
        proposal.id,
      );
      expect(learnerView).toHaveLength(1);
      expect(learnerView[0]).toMatchObject({
        rating: 2,
        comment: 'super secret learner opinion',
      });

      await feedback.submitFeedback(tutorId, proposal.id, {
        rating: 4,
        comment: 'tutor opinion',
      });

      const tutorViewAfter = await feedback.getFeedbackForProposal(
        tutorId,
        proposal.id,
      );
      const learnerViewAfter = await feedback.getFeedbackForProposal(
        learnerId,
        proposal.id,
      );
      expect(tutorViewAfter).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rating: 2,
            comment: 'super secret learner opinion',
          }),
          expect.objectContaining({ rating: 4, comment: 'tutor opinion' }),
        ]),
      );
      expect(learnerViewAfter).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rating: 2,
            comment: 'super secret learner opinion',
          }),
          expect.objectContaining({ rating: 4, comment: 'tutor opinion' }),
        ]),
      );
    });

    it('reveals both sides once the fallback deadline has passed, even if only one party ever submitted', async () => {
      const longAgo = new Date(
        Date.now() - (REVEAL_FALLBACK_DAYS + 1) * 86_400_000,
      );
      const { proposal } = await completedProposal(longAgo);

      await feedback.submitFeedback(learnerId, proposal.id, {
        rating: 1,
        comment: 'only the learner ever submits',
      });

      const tutorView = await feedback.getFeedbackForProposal(
        tutorId,
        proposal.id,
      );
      expect(tutorView).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rating: 1,
            comment: 'only the learner ever submits',
          }),
        ]),
      );
    });

    it('does not reveal before the fallback deadline when only one party submitted', async () => {
      const recentlyCompleted = new Date(
        Date.now() - (REVEAL_FALLBACK_DAYS - 1) * 86_400_000,
      );
      const { proposal } = await completedProposal(recentlyCompleted);

      await feedback.submitFeedback(learnerId, proposal.id, { rating: 3 });

      const tutorView = await feedback.getFeedbackForProposal(
        tutorId,
        proposal.id,
      );
      expect((tutorView[0] as HiddenFeedback).status).toBe('hidden');
    });
  });

  describe('getTutorRatingSummary', () => {
    it('returns averageRating: null (not 0) for a tutor with zero reviews', async () => {
      const summary = await feedback.getTutorRatingSummary(tutorId);
      expect(summary).toEqual({ averageRating: null, reviewCount: 0 });
    });

    it('returns the average rating and count once reviews exist', async () => {
      const { proposal: p1 } = await completedProposal();
      await feedback.submitFeedback(learnerId, p1.id, { rating: 4 });

      const { proposal: p2 } = await completedProposal();
      await feedback.submitFeedback(learnerId, p2.id, { rating: 2 });

      const summary = await feedback.getTutorRatingSummary(tutorId);
      expect(summary.reviewCount).toBe(2);
      expect(summary.averageRating).toBe(3);
    });
  });
});
