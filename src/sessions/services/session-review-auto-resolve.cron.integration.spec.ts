import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { DailyService } from './daily.service';
import { PayoutsService } from '../../payments/services/payouts.service';
import { SessionsGateway } from '../gateways/sessions.gateway';
import { UploadService } from '../../storage/upload.service';
import { SessionsService } from './sessions.service';
import { SessionReviewAutoResolveCron } from './session-review-auto-resolve.cron';

const HOUR_MS = 60 * 60_000;

describe('SessionReviewAutoResolveCron (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cron: SessionReviewAutoResolveCron;

  let tutorId: string;
  let learnerId: string;
  let categoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        SessionReviewAutoResolveCron,
        SessionsService,
        { provide: DailyService, useValue: {} },
        { provide: UploadService, useValue: {} },
        { provide: SessionsGateway, useValue: { emitParticipantJoined: jest.fn() } },
        {
          provide: PayoutsService,
          useValue: {
            recordPayoutForCompletedSession: jest.fn().mockResolvedValue(null),
            releasePayout: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    cron = moduleRef.get(SessionReviewAutoResolveCron);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function makeStaleSession(params: {
    bookingEndTime: Date;
    summarySubmittedAt: Date | null;
    learnerConfirmedAt: Date | null;
    disputedAt?: Date | null;
  }) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [tutor, learner] = await Promise.all([
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
    ]);
    tutorId = tutor.id;
    learnerId = learner.id;

    const category = await prisma.category.create({
      data: { name: `Cat ${suffix}`, slug: `cat-${suffix}` },
    });
    categoryId = category.id;

    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title: 'Test job',
        categoryId,
        status: 'CLOSED',
      },
    });
    const proposal = await prisma.proposal.create({
      data: {
        learnRequestId: learnRequest.id,
        tutorId,
        sessionDurationMinutes: 60,
        totalPrice: 100,
      },
    });
    const session = await prisma.session.create({
      data: {
        proposalId: proposal.id,
        sessionNumber: 1,
        title: 'Session 1',
        status: 'PENDING_REVIEW',
        tutorJoinedAt: new Date(),
        summarySubmittedAt: params.summarySubmittedAt,
        summary: params.summarySubmittedAt ? 'Real summary' : null,
        learnerConfirmedAt: params.learnerConfirmedAt,
        disputedAt: params.disputedAt ?? null,
      },
    });
    await prisma.booking.create({
      data: {
        tutorId,
        learnerId,
        sessionId: session.id,
        startTime: new Date(params.bookingEndTime.getTime() - HOUR_MS),
        endTime: params.bookingEndTime,
        status: 'CONFIRMED',
      },
    });
    return session.id;
  }

  afterEach(async () => {
    await prisma.learnRequest.deleteMany({ where: { learnerId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [tutorId, learnerId] } } });
  });

  it('auto-confirms a stale learner branch and completes once the tutor branch is already ready', async () => {
    const sessionId = await makeStaleSession({
      bookingEndTime: new Date(Date.now() - 49 * HOUR_MS), // just over 48h
      summarySubmittedAt: new Date(),
      learnerConfirmedAt: null,
    });

    await cron.resolveStaleReviews();

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.learnerConfirmedAt).not.toBeNull();
    expect(session.status).toBe('COMPLETED');
  });

  it('gives a stale tutor branch the exact placeholder summary text', async () => {
    const sessionId = await makeStaleSession({
      bookingEndTime: new Date(Date.now() - 49 * HOUR_MS),
      summarySubmittedAt: null,
      learnerConfirmedAt: new Date(),
    });

    await cron.resolveStaleReviews();

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.summary).toBe('No summary was provided.');
    expect(session.summarySubmittedAt).not.toBeNull();
    expect(session.status).toBe('COMPLETED');
  });

  it('does not touch a session just under the 48h cutoff', async () => {
    const sessionId = await makeStaleSession({
      bookingEndTime: new Date(Date.now() - 47 * HOUR_MS), // just under 48h
      summarySubmittedAt: null,
      learnerConfirmedAt: null,
    });

    await cron.resolveStaleReviews();

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.summarySubmittedAt).toBeNull();
    expect(session.learnerConfirmedAt).toBeNull();
    expect(session.status).toBe('PENDING_REVIEW');
  });

  it('never auto-resolves a disputed session, even past the cutoff', async () => {
    const sessionId = await makeStaleSession({
      bookingEndTime: new Date(Date.now() - 49 * HOUR_MS),
      summarySubmittedAt: new Date(),
      learnerConfirmedAt: null,
      disputedAt: new Date(),
    });

    await cron.resolveStaleReviews();

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.learnerConfirmedAt).toBeNull();
    expect(session.status).toBe('PENDING_REVIEW');
  });

  it('backfills each branch independently -- both stale resolves independently in one pass', async () => {
    const sessionId = await makeStaleSession({
      bookingEndTime: new Date(Date.now() - 49 * HOUR_MS),
      summarySubmittedAt: null,
      learnerConfirmedAt: null,
    });

    await cron.resolveStaleReviews();

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.summary).toBe('No summary was provided.');
    expect(session.learnerConfirmedAt).not.toBeNull();
    expect(session.status).toBe('COMPLETED');
  });
});
