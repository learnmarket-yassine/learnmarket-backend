import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionsService } from '../../sessions/services/sessions.service';
import { DailyService } from '../../sessions/services/daily.service';
import { PayoutsService } from '../../payments/services/payouts.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { UploadService } from '../../storage/upload.service';
import { BookingsCompletionCron } from './bookings-completion.cron';

describe('BookingsCompletionCron (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let cron: BookingsCompletionCron;

  let tutorId: string;
  let learnerId: string;
  let categoryId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        BookingsCompletionCron,
        SessionsService,
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: DailyService, useValue: {} },
        { provide: UploadService, useValue: {} },
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
    cron = moduleRef.get(BookingsCompletionCron);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function makeSession(status: 'BOOKED', tutorJoinedAt: Date | null) {
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
        status,
        tutorJoinedAt,
      },
    });
    await prisma.booking.create({
      data: {
        tutorId,
        learnerId,
        sessionId: session.id,
        startTime: new Date(Date.now() - 2 * 60 * 60_000),
        endTime: new Date(Date.now() - 60 * 60_000), // already elapsed
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

  it('a session with no verified tutorJoinedAt completes immediately and never enters PENDING_REVIEW', async () => {
    const sessionId = await makeSession('BOOKED', null);

    await cron.completeFinishedBookings();

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe('COMPLETED');

    const booking = await prisma.booking.findUniqueOrThrow({ where: { sessionId } });
    expect(booking.status).toBe('COMPLETED');
  });

  it('a session with verified tutorJoinedAt enters PENDING_REVIEW instead of completing, booking stays CONFIRMED', async () => {
    const sessionId = await makeSession('BOOKED', new Date());

    await cron.completeFinishedBookings();

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe('PENDING_REVIEW');

    const booking = await prisma.booking.findUniqueOrThrow({ where: { sessionId } });
    expect(booking.status).toBe('CONFIRMED');
  });

  it('does not reprocess a session already gated on a previous tick', async () => {
    const sessionId = await makeSession('BOOKED', new Date());

    await cron.completeFinishedBookings();
    await cron.completeFinishedBookings();

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe('PENDING_REVIEW');
    const booking = await prisma.booking.findUniqueOrThrow({ where: { sessionId } });
    expect(booking.status).toBe('CONFIRMED');
  });
});
