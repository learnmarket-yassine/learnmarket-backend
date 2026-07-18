import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LearnRequestStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProposalsService } from './proposals.service';

describe('ProposalsService.create eligibility guard (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let proposals: ProposalsService;

  let tutorId: string;
  let learnerId: string;
  let categoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [PrismaService, ProposalsService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    proposals = moduleRef.get(ProposalsService);
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
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, learnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  const dto = {
    sessionDurationMinutes: 60,
    totalSessions: 1,
    totalPrice: 50,
  };

  it('accepts a proposal when the learn request is OPEN', async () => {
    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title: 'Open request',
        status: LearnRequestStatus.OPEN,
        categoryId,
      },
    });

    await expect(
      proposals.create(tutorId, learnRequest.id, dto),
    ).resolves.toBeDefined();
  });

  const nonOpenStatuses: LearnRequestStatus[] = [
    LearnRequestStatus.DRAFT,
    LearnRequestStatus.CLOSED,
    LearnRequestStatus.CANCELLED,
    LearnRequestStatus.COMPLETED,
    LearnRequestStatus.REMOVED,
  ];

  it.each(nonOpenStatuses)(
    'rejects a proposal when the learn request is %s',
    async (status) => {
      const learnRequest = await prisma.learnRequest.create({
        data: {
          learnerId,
          type: 'ONE_TIME',
          title: `${status} request`,
          status,
          categoryId:
            status === LearnRequestStatus.DRAFT ? undefined : categoryId,
        },
      });

      await expect(
        proposals.create(tutorId, learnRequest.id, dto),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );
});
