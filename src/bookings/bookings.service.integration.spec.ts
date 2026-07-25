import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HoldsService } from '../holds/services/holds.service';
import { BookingsService } from './services/bookings.service';

describe('BookingsService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let holds: HoldsService;
  let bookings: BookingsService;

  let tutorId: string;
  let learnerId: string;
  let sessionAId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [PrismaService, HoldsService, BookingsService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    holds = moduleRef.get(HoldsService);
    bookings = moduleRef.get(BookingsService);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
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

    const learnRequest = await prisma.learnRequest.create({
      data: { learnerId, type: 'ONE_TIME', title: 'Integration test job' },
    });
    const proposal = await prisma.proposal.create({
      data: {
        learnRequestId: learnRequest.id,
        tutorId,
        sessionDurationMinutes: 60,
        totalPrice: 100,
      },
    });
    const sessionA = await prisma.session.create({
      data: {
        proposalId: proposal.id,
        sessionNumber: 1,
        title: 'Session 1',
        status: 'PENDING_SCHEDULE',
      },
    });
    sessionAId = sessionA.id;
  });

  afterEach(async () => {
    await prisma.learnRequest.deleteMany({ where: { learnerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, learnerId] } },
    });
  });

  it('cancelling a booking sets the session to CANCELLED, not PENDING_SCHEDULE', async () => {
    const hold = await holds.createSlotHold(
      tutorId,
      learnerId,
      sessionAId,
      new Date('2027-01-01T10:00:00.000Z'),
      new Date('2027-01-01T11:00:00.000Z'),
    );
    const booking = await holds.confirmSlotHold(hold.id);

    await bookings.cancel(learnerId, booking.id);

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionAId },
    });
    expect(session.status).toBe('CANCELLED');

    const cancelledBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(cancelledBooking.status).toBe('CANCELLED');
  });

  it('rejects cancelling a booking the caller has no access to', async () => {
    const hold = await holds.createSlotHold(
      tutorId,
      learnerId,
      sessionAId,
      new Date('2027-01-01T10:00:00.000Z'),
      new Date('2027-01-01T11:00:00.000Z'),
    );
    const booking = await holds.confirmSlotHold(hold.id);

    await expect(
      bookings.cancel('someone-else', booking.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects cancelling an already-cancelled booking', async () => {
    const hold = await holds.createSlotHold(
      tutorId,
      learnerId,
      sessionAId,
      new Date('2027-01-01T10:00:00.000Z'),
      new Date('2027-01-01T11:00:00.000Z'),
    );
    const booking = await holds.confirmSlotHold(hold.id);
    await bookings.cancel(learnerId, booking.id);

    await expect(bookings.cancel(learnerId, booking.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
