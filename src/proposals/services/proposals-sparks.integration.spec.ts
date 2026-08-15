import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SparksTransactionType,
  LearnRequestStatus,
  TutorVerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../../messaging/services/messaging.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { StripeService } from '../../payments/services/stripe.service';
import { SparksService } from '../../sparks/services/sparks.service';
import { ProposalsService } from './proposals.service';
import { PROPOSAL_SPARKS_COST } from '../../sparks/constants/sparks.constants';
import { CreateProposalDto } from '../dto/create-proposal.dto';

describe('ProposalsService.create <-> Sparks wiring (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let proposals: ProposalsService;

  let tutorId: string;
  let learnerId: string;
  let categoryId: string;
  let learnRequestId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        ProposalsService,
        SparksService,
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        {
          provide: MessagingService,
          useValue: { recomputeConversationActiveState: jest.fn() },
        },
        { provide: StripeService, useValue: {} },
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

    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title: 'Request',
        status: LearnRequestStatus.OPEN,
        categoryId,
      },
    });
    learnRequestId = learnRequest.id;
  });

  afterEach(async () => {
    await prisma.learnRequest.deleteMany({ where: { id: learnRequestId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, learnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  function dto(): CreateProposalDto {
    return {
      sessionDurationMinutes: 60,
      totalPrice: 50,
      sessionPlans: [{ title: 'Session 1' }],
    };
  }

  async function approveTutor(sparksBalance: number) {
    await prisma.tutorProfile.create({
      data: {
        userId: tutorId,
        verificationStatus: TutorVerificationStatus.APPROVED,
        sparksBalance,
      },
    });
  }

  it('a verified tutor with sufficient balance: proposal is created, exactly PROPOSAL_SPARKS_COST is deducted, one PROPOSAL_SPEND transaction is logged', async () => {
    await approveTutor(10);

    const created = await proposals.create(tutorId, learnRequestId, dto());

    const profile = await prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: tutorId },
    });
    expect(profile.sparksBalance).toBe(10 - PROPOSAL_SPARKS_COST);

    const transactions = await prisma.sparksTransaction.findMany({
      where: { tutorId, type: SparksTransactionType.PROPOSAL_SPEND },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].proposalId).toBe(created.id);
    expect(transactions[0].amount).toBe(-PROPOSAL_SPARKS_COST);
  });

  it('a verified tutor with insufficient balance is rejected cleanly: no proposal row, no partial deduction, and the Sparks-specific error -- not the verification error', async () => {
    await approveTutor(PROPOSAL_SPARKS_COST - 1);

    await expect(
      proposals.create(tutorId, learnRequestId, dto()),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      message: expect.stringContaining('Sparks'),
    });

    const profile = await prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: tutorId },
    });
    expect(profile.sparksBalance).toBe(PROPOSAL_SPARKS_COST - 1);

    const proposalCount = await prisma.proposal.count({
      where: { learnRequestId, tutorId },
    });
    expect(proposalCount).toBe(0);
  });

  it('an unverified tutor with a sufficient balance is blocked with the verification error, not the Sparks error, and Sparks are never touched', async () => {
    await prisma.tutorProfile.create({
      data: {
        userId: tutorId,
        verificationStatus: TutorVerificationStatus.UNSUBMITTED,
        sparksBalance: 999,
      },
    });

    await expect(
      proposals.create(tutorId, learnRequestId, dto()),
    ).rejects.toMatchObject({
      constructor: ForbiddenException,
      message: expect.stringContaining('verification'),
    });

    const profile = await prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: tutorId },
    });
    expect(profile.sparksBalance).toBe(999); // untouched
    const transactions = await prisma.sparksTransaction.findMany({
      where: { tutorId },
    });
    expect(transactions).toHaveLength(0);
  });
});
