import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../storage/upload.service';
import { SessionsGateway } from '../gateways/sessions.gateway';
import { SessionsService } from './sessions.service';
import { ZoomMeeting, ZoomService } from './zoom.service';

describe('SessionsService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let sessions: SessionsService;
  let createMeetingMock: jest.Mock;
  let emitParticipantJoinedMock: jest.Mock;

  let tutorId: string;
  let learnerId: string;
  let outsiderId: string;
  let sessionId: string;
  let bookingStart: Date;
  let bookingEnd: Date;

  const testMeeting: ZoomMeeting = {
    id: 84912052310,
    join_url: 'https://zoom.us/j/testmeeting',
    start_url: 'https://zoom.us/s/testmeeting?zak=host-privilege-token',
    password: 'pw123',
  };

  beforeAll(async () => {
    createMeetingMock = jest.fn().mockResolvedValue(testMeeting);
    emitParticipantJoinedMock = jest.fn();

    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        SessionsService,
        {
          provide: ZoomService,
          useValue: { createMeeting: createMeetingMock },
        },
        { provide: UploadService, useValue: {} },
        {
          provide: SessionsGateway,
          useValue: { emitParticipantJoined: emitParticipantJoinedMock },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    sessions = moduleRef.get(SessionsService);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    createMeetingMock.mockClear();
    createMeetingMock.mockResolvedValue(testMeeting);
    emitParticipantJoinedMock.mockClear();

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [tutor, learner, outsider] = await Promise.all([
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
    ]);
    tutorId = tutor.id;
    learnerId = learner.id;
    outsiderId = outsider.id;

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
    const session = await prisma.session.create({
      data: {
        proposalId: proposal.id,
        sessionNumber: 1,
        title: 'Session 1',
        status: 'BOOKED',
      },
    });
    sessionId = session.id;

    bookingStart = new Date(Date.now() - 5 * 60_000);
    bookingEnd = new Date(bookingStart.getTime() + 60 * 60_000);
    await prisma.booking.create({
      data: {
        tutorId,
        learnerId,
        sessionId,
        startTime: bookingStart,
        endTime: bookingEnd,
        status: 'CONFIRMED',
      },
    });
  });

  afterEach(async () => {
    await prisma.learnRequest.deleteMany({ where: { learnerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, learnerId, outsiderId] } },
    });
  });

  describe('getSessionContext', () => {
    it('returns safe fields only, never the zoom columns', async () => {
      await sessions.provisionMeeting(sessionId);

      const context = await sessions.getSessionContext(learnerId, sessionId);
      const rawJson = JSON.stringify(context);

      expect(context.booking?.startTime.toISOString()).toBe(
        bookingStart.toISOString(),
      );
      expect(rawJson).not.toContain(testMeeting.start_url);
      expect(rawJson).not.toContain(testMeeting.join_url);
      expect(rawJson).not.toContain('zoomStartUrl');
    });

    it('returns 404 for a non-participant', async () => {
      await expect(
        sessions.getSessionContext(outsiderId, sessionId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getMeetingDetails', () => {
    it('returns not_provisioned before a meeting has been created', async () => {
      const details = await sessions.getMeetingDetails(tutorId, sessionId);
      expect(details).toEqual({ status: 'not_provisioned', canJoinYet: false });
    });

    it("never leaks the tutor's zoomStartUrl in the learner's raw response", async () => {
      await sessions.provisionMeeting(sessionId);

      const learnerResponse = await sessions.getMeetingDetails(
        learnerId,
        sessionId,
      );
      const rawJson = JSON.stringify(learnerResponse);

      expect(rawJson).not.toContain(testMeeting.start_url);
      expect(rawJson.includes('zak=host-privilege-token')).toBe(false);
    });

    it("gives the tutor start_url and the learner join_url -- distinct values", async () => {
      await sessions.provisionMeeting(sessionId);

      const tutorResponse = await sessions.getMeetingDetails(
        tutorId,
        sessionId,
      );
      const learnerResponse = await sessions.getMeetingDetails(
        learnerId,
        sessionId,
      );

      expect(tutorResponse).toMatchObject({ joinUrl: testMeeting.start_url });
      expect(learnerResponse).toMatchObject({ joinUrl: testMeeting.join_url });
      expect(tutorResponse.status === 'provisioned' && tutorResponse.joinUrl).not.toBe(
        learnerResponse.status === 'provisioned' && learnerResponse.joinUrl,
      );
    });

    it('returns 404 for a user with no relationship to the session', async () => {
      await expect(
        sessions.getMeetingDetails(outsiderId, sessionId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('canJoinYet is true within the join window around the booking time', async () => {
      await sessions.provisionMeeting(sessionId);
      const details = await sessions.getMeetingDetails(tutorId, sessionId);
      expect(details.canJoinYet).toBe(true);
    });

    it('canJoinYet is false long before the booking start time', async () => {
      await prisma.booking.update({
        where: { sessionId },
        data: {
          startTime: new Date(Date.now() + 60 * 60_000),
          endTime: new Date(Date.now() + 120 * 60_000),
        },
      });
      await sessions.provisionMeeting(sessionId);

      const details = await sessions.getMeetingDetails(tutorId, sessionId);
      expect(details.canJoinYet).toBe(false);
    });

    it('canJoinYet is false long after the booking end + grace window', async () => {
      await prisma.booking.update({
        where: { sessionId },
        data: {
          startTime: new Date(Date.now() - 300 * 60_000),
          endTime: new Date(Date.now() - 200 * 60_000),
        },
      });
      await sessions.provisionMeeting(sessionId);

      const details = await sessions.getMeetingDetails(tutorId, sessionId);
      expect(details.canJoinYet).toBe(false);
    });
  });

  describe('provisionMeeting', () => {
    it('is idempotent -- a second call does not re-create the meeting', async () => {
      await sessions.provisionMeeting(sessionId);
      await sessions.provisionMeeting(sessionId);

      expect(createMeetingMock).toHaveBeenCalledTimes(1);
    });

    it('never throws when the Zoom API call fails', async () => {
      createMeetingMock.mockRejectedValue(new Error('Zoom API unavailable'));

      await expect(sessions.provisionMeeting(sessionId)).resolves.toBeUndefined();

      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.zoomJoinUrl).toBeNull();
    });
  });

  describe('retryMeeting', () => {
    it('provisions a meeting for a session with no meeting yet', async () => {
      const result = await sessions.retryMeeting(tutorId, sessionId);
      expect(result).toMatchObject({ status: 'provisioned' });
      expect(createMeetingMock).toHaveBeenCalledTimes(1);
    });

    it('rejects with ConflictException if a meeting is already provisioned', async () => {
      await sessions.provisionMeeting(sessionId);

      await expect(
        sessions.retryMeeting(tutorId, sessionId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a learner calling retry as not found (tutor-only)', async () => {
      await expect(
        sessions.retryMeeting(learnerId, sessionId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('join', () => {
    it('sets tutorJoinedAt on first join and does not overwrite it on a second call', async () => {
      await sessions.join(tutorId, sessionId);
      const first = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(first.tutorJoinedAt).not.toBeNull();

      await sessions.join(tutorId, sessionId);
      const second = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(second.tutorJoinedAt?.toISOString()).toBe(
        first.tutorJoinedAt?.toISOString(),
      );
    });

    it('sets learnerJoinedAt independently of tutorJoinedAt', async () => {
      await sessions.join(learnerId, sessionId);
      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.learnerJoinedAt).not.toBeNull();
      expect(session.tutorJoinedAt).toBeNull();
      expect(emitParticipantJoinedMock).toHaveBeenCalledWith(
        sessionId,
        'LEARNER',
      );
    });

    it('rejects a non-participant', async () => {
      await expect(sessions.join(outsiderId, sessionId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
