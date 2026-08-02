import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HoldsService } from '../holds/services/holds.service';
import { SessionsService } from '../sessions/services/sessions.service';
import { DailyService, DailyRoom } from '../sessions/services/daily.service';
import { PayoutsService } from '../payments/services/payouts.service';
import { UploadService } from '../storage/upload.service';
import { BookingsService } from './services/bookings.service';

describe('BookingsService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let holds: HoldsService;
  let bookings: BookingsService;
  let createRoomMock: jest.Mock;

  let tutorId: string;
  let learnerId: string;
  let sessionAId: string;

  const testRoom: DailyRoom = {
    name: 'test-room',
    url: 'https://learnmarket.daily.co/test-room',
  };

  beforeAll(async () => {
    createRoomMock = jest.fn().mockResolvedValue(testRoom);

    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        HoldsService,
        BookingsService,
        SessionsService,
        {
          provide: DailyService,
          useValue: {
            createRoom: createRoomMock,
            updateRoomExpiry: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: UploadService, useValue: {} },
        { provide: PayoutsService, useValue: {} },
      ],
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
    createRoomMock.mockClear();
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

  it('findConfirmedByLearner returns the confirmed booking for the learner', async () => {
    const hold = await holds.createSlotHold(
      tutorId,
      learnerId,
      sessionAId,
      new Date('2027-01-01T10:00:00.000Z'),
      new Date('2027-01-01T11:00:00.000Z'),
    );
    const booking = await holds.confirmSlotHold(hold.id);

    const result = await bookings.findConfirmedByLearner(learnerId);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(booking.id);
    expect(result[0].tutor).toEqual({ firstname: 'T', lastname: 'Tutor' });
  });

  it('filters findConfirmedByTutor and findConfirmedByLearner by from/to', async () => {
    await holds
      .createSlotHold(
        tutorId,
        learnerId,
        sessionAId,
        new Date('2027-01-01T10:00:00.000Z'),
        new Date('2027-01-01T11:00:00.000Z'),
      )
      .then((hold) => holds.confirmSlotHold(hold.id));

    const inRange = await bookings.findConfirmedByTutor(tutorId, {
      from: '2027-01-01T00:00:00.000Z',
      to: '2027-01-02T00:00:00.000Z',
    });
    expect(inRange).toHaveLength(1);

    const outOfRange = await bookings.findConfirmedByTutor(tutorId, {
      from: '2027-02-01T00:00:00.000Z',
    });
    expect(outOfRange).toHaveLength(0);

    const learnerInRange = await bookings.findConfirmedByLearner(learnerId, {
      to: '2027-01-02T00:00:00.000Z',
    });
    expect(learnerInRange).toHaveLength(1);
  });

  it('still confirms the booking when the Daily API fails during provisioning', async () => {
    createRoomMock.mockRejectedValueOnce(new Error('Daily API unavailable'));

    const hold = await holds.createSlotHold(
      tutorId,
      learnerId,
      sessionAId,
      new Date('2027-01-01T10:00:00.000Z'),
      new Date('2027-01-01T11:00:00.000Z'),
    );
    await holds.confirmSlotHold(hold.id);
    const provisioned = await prisma.session.findUniqueOrThrow({
      where: { id: sessionAId },
    });
    expect(provisioned.dailyRoomName).toBeNull();
  });
});
