import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HoldsService } from '../holds/services/holds.service';
import { SessionsService } from '../sessions/services/sessions.service';
import { ZoomService, ZoomMeeting } from '../sessions/services/zoom.service';
import { SessionsGateway } from '../sessions/gateways/sessions.gateway';
import { UploadService } from '../storage/upload.service';
import { BookingsService } from './services/bookings.service';

describe('BookingsService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let holds: HoldsService;
  let bookings: BookingsService;
  let createMeetingMock: jest.Mock;
  let deleteMeetingMock: jest.Mock;

  let tutorId: string;
  let learnerId: string;
  let sessionAId: string;

  const testMeeting: ZoomMeeting = {
    id: 84912052310,
    join_url: 'https://zoom.us/j/testmeeting',
    start_url: 'https://zoom.us/s/testmeeting?zak=host-token',
    password: 'pw123',
  };

  beforeAll(async () => {
    createMeetingMock = jest.fn().mockResolvedValue(testMeeting);
    deleteMeetingMock = jest.fn().mockResolvedValue(undefined);

    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        HoldsService,
        BookingsService,
        SessionsService,
        {
          provide: ZoomService,
          useValue: {
            createMeeting: createMeetingMock,
            deleteMeeting: deleteMeetingMock,
          },
        },
        { provide: UploadService, useValue: {} },
        {
          provide: SessionsGateway,
          useValue: { emitParticipantJoined: jest.fn() },
        },
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
    createMeetingMock.mockClear();
    deleteMeetingMock.mockClear();
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

  it('deletes the Zoom meeting when cancelling a booking that has one provisioned', async () => {
    const hold = await holds.createSlotHold(
      tutorId,
      learnerId,
      sessionAId,
      new Date('2027-01-01T10:00:00.000Z'),
      new Date('2027-01-01T11:00:00.000Z'),
    );
    const booking = await holds.confirmSlotHold(hold.id);
    expect(createMeetingMock).toHaveBeenCalledTimes(1);
    const provisioned = await prisma.session.findUniqueOrThrow({
      where: { id: sessionAId },
    });
    expect(provisioned.zoomMeetingId).toBe(String(testMeeting.id));

    await bookings.cancel(learnerId, booking.id);

    expect(deleteMeetingMock).toHaveBeenCalledWith(String(testMeeting.id));
    const afterCancel = await prisma.session.findUniqueOrThrow({
      where: { id: sessionAId },
    });
    expect(afterCancel.zoomMeetingId).toBeNull();
    expect(afterCancel.zoomJoinUrl).toBeNull();
    expect(afterCancel.zoomStartUrl).toBeNull();
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

  it('does not error deleting a meeting that was never provisioned (Zoom creation had failed)', async () => {
    createMeetingMock.mockRejectedValueOnce(new Error('Zoom API unavailable'));

    const hold = await holds.createSlotHold(
      tutorId,
      learnerId,
      sessionAId,
      new Date('2027-01-01T10:00:00.000Z'),
      new Date('2027-01-01T11:00:00.000Z'),
    );
    const booking = await holds.confirmSlotHold(hold.id);
    const provisioned = await prisma.session.findUniqueOrThrow({
      where: { id: sessionAId },
    });
    expect(provisioned.zoomMeetingId).toBeNull();

    await expect(bookings.cancel(learnerId, booking.id)).resolves.toBeDefined();
    expect(deleteMeetingMock).not.toHaveBeenCalled();
  });
});
