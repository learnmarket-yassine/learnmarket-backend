import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LearnRequestStatus, LearnRequestType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../../messaging/services/messaging.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SparksService } from '../../sparks/services/sparks.service';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { ProposalsService } from './proposals.service';
import { CreateProposalDto } from '../dto/create-proposal.dto';

describe('ProposalsService.create eligibility guard (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let proposals: ProposalsService;

  let tutorId: string;
  let learnerId: string;
  let categoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        ProposalsService,
        PlatformSettingsService,
        { provide: MessagingService, useValue: { recomputeConversationActiveState: jest.fn() } },
        { provide: SparksService, useValue: { spendSparksForProposal: jest.fn() } },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
      ],
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

  function dto(overrides: Partial<CreateProposalDto> = {}): CreateProposalDto {
    return {
      sessionDurationMinutes: 60,
      totalPrice: 50,
      sessionPlans: [{ title: 'Session 1' }],
      ...overrides,
    };
  }

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
      proposals.create(tutorId, learnRequest.id, dto()),
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
        proposals.create(tutorId, learnRequest.id, dto()),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('rejects a ONE_TIME proposal with more than one session plan', async () => {
    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: LearnRequestType.ONE_TIME,
        title: 'One time request',
        status: LearnRequestStatus.OPEN,
        categoryId,
      },
    });

    await expect(
      proposals.create(
        tutorId,
        learnRequest.id,
        dto({
          sessionPlans: [{ title: 'Session 1' }, { title: 'Session 2' }],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a ONE_TIME proposal with exactly one session plan', async () => {
    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: LearnRequestType.ONE_TIME,
        title: 'One time request',
        status: LearnRequestStatus.OPEN,
        categoryId,
      },
    });

    await expect(
      proposals.create(tutorId, learnRequest.id, dto()),
    ).resolves.toBeDefined();
  });

  it('forces payoutMethod to ON_COMPLETION for a single-session proposal regardless of what was submitted', async () => {
    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: LearnRequestType.ONE_TIME,
        title: 'One time request',
        status: LearnRequestStatus.OPEN,
        categoryId,
      },
    });

    const created = await proposals.create(
      tutorId,
      learnRequest.id,
      dto({ payoutMethod: 'PER_SESSION' as CreateProposalDto['payoutMethod'] }),
    );

    expect(created.payoutMethod).toBe('ON_COMPLETION');
  });

  it('rejects a second proposal from the same tutor while one is PENDING, and allows one after a DECLINED', async () => {
    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: LearnRequestType.ONE_TIME,
        title: 'One time request',
        status: LearnRequestStatus.OPEN,
        categoryId,
      },
    });

    const first = await proposals.create(tutorId, learnRequest.id, dto());

    await expect(
      proposals.create(tutorId, learnRequest.id, dto()),
    ).rejects.toBeInstanceOf(ConflictException);

    await prisma.proposal.update({
      where: { id: first.id },
      data: { status: 'DECLINED' },
    });

    await expect(
      proposals.create(tutorId, learnRequest.id, dto()),
    ).resolves.toBeDefined();
  });

  it('the partial unique index rejects a duplicate PENDING/ACCEPTED proposal even if the app-level pre-check is bypassed', async () => {
    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: LearnRequestType.ONE_TIME,
        title: 'One time request',
        status: LearnRequestStatus.OPEN,
        categoryId,
      },
    });

    await prisma.proposal.create({
      data: {
        learnRequestId: learnRequest.id,
        tutorId,
        sessionDurationMinutes: 60,
        totalPrice: 50,
        status: 'PENDING',
      },
    });

    await expect(
      prisma.proposal.create({
        data: {
          learnRequestId: learnRequest.id,
          tutorId,
          sessionDurationMinutes: 60,
          totalPrice: 50,
          status: 'PENDING',
        },
      }),
    ).rejects.toThrow();
  });
});
