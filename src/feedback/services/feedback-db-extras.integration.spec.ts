import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';

describe('feedbacks rating_range CHECK constraint (integration, real DB, raw insert bypassing the app layer)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  let tutorId: string;
  let learnerId: string;
  let categoryId: string;
  let proposalId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [tutor, learner, category] = await Promise.all([
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
      prisma.category.create({
        data: { name: `Category ${suffix}`, slug: `category-${suffix}` },
      }),
    ]);
    tutorId = tutor.id;
    learnerId = learner.id;
    categoryId = category.id;

    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title: 'Feedback constraint test request',
        status: 'COMPLETED',
        completedAt: new Date(),
        categoryId,
      },
    });

    const proposal = await prisma.proposal.create({
      data: {
        learnRequestId: learnRequest.id,
        tutorId,
        sessionDurationMinutes: 60,
        totalPrice: 50,
        status: 'ACCEPTED',
      },
    });
    proposalId = proposal.id;
  });

  afterEach(async () => {
    await prisma.feedback.deleteMany({ where: { proposalId } });
    await prisma.proposal.deleteMany({ where: { id: proposalId } });
    await prisma.learnRequest.deleteMany({ where: { learnerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, learnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it('rating_range rejects a rating below 1 on a raw insert', async () => {
    await expect(
      prisma.feedback.create({
        data: {
          proposalId,
          authorId: tutorId,
          aboutUserId: learnerId,
          rating: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('rating_range rejects a rating above 5 on a raw insert', async () => {
    await expect(
      prisma.feedback.create({
        data: {
          proposalId,
          authorId: tutorId,
          aboutUserId: learnerId,
          rating: 6,
        },
      }),
    ).rejects.toThrow();
  });

  it('rating_range accepts ratings within 1-5 on a raw insert', async () => {
    const feedback = await prisma.feedback.create({
      data: {
        proposalId,
        authorId: tutorId,
        aboutUserId: learnerId,
        rating: 3,
      },
    });
    expect(feedback.rating).toBe(3);
  });
});
