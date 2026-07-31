import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../storage/upload.service';
import { PayoutsService } from '../../payments/services/payouts.service';
import { SessionsGateway } from '../gateways/sessions.gateway';
import { SessionsService } from './sessions.service';
import { DailyRoom, DailyService } from './daily.service';

describe('SessionsService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let sessions: SessionsService;
  let createRoomMock: jest.Mock;
  let deleteRoomMock: jest.Mock;
  let createMeetingTokenMock: jest.Mock;
  let emitParticipantJoinedMock: jest.Mock;
  let recordPayoutMock: jest.Mock;
  let releasePayoutMock: jest.Mock;

  let tutorId: string;
  let learnerId: string;
  let outsiderId: string;
  let categoryId: string;
  let sessionId: string;
  let bookingStart: Date;
  let bookingEnd: Date;

  const testRoom: DailyRoom = {
    name: 'test-room',
    url: 'https://learnmarket.daily.co/test-room',
  };

  beforeAll(async () => {
    createRoomMock = jest.fn().mockResolvedValue(testRoom);
    deleteRoomMock = jest.fn().mockResolvedValue(undefined);
    // Token content encodes which caller/role it was minted for, so tests
    // can assert the tutor and learner get distinct, correctly-scoped tokens
    // without needing a real JWT decode.
    createMeetingTokenMock = jest
      .fn()
      .mockImplementation(
        async (params: { userId: string; isOwner: boolean }) =>
          `token-for-${params.userId}-owner-${params.isOwner}`,
      );
    emitParticipantJoinedMock = jest.fn();
    // No Payment fixture in these tests -- nothing payable, so the cascade's
    // payout branch is a no-op by default. Gate tests assert on session/
    // learnRequest status transitions, not payout amounts.
    recordPayoutMock = jest.fn().mockResolvedValue(null);
    releasePayoutMock = jest.fn().mockResolvedValue(undefined);

    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        SessionsService,
        {
          provide: DailyService,
          useValue: {
            createRoom: createRoomMock,
            updateRoomExpiry: jest.fn().mockResolvedValue(undefined),
            deleteRoom: deleteRoomMock,
            createMeetingToken: createMeetingTokenMock,
          },
        },
        { provide: UploadService, useValue: {} },
        {
          provide: SessionsGateway,
          useValue: { emitParticipantJoined: emitParticipantJoinedMock },
        },
        {
          provide: PayoutsService,
          useValue: {
            recordPayoutForCompletedSession: recordPayoutMock,
            releasePayout: releasePayoutMock,
          },
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
    createRoomMock.mockClear();
    createRoomMock.mockResolvedValue(testRoom);
    deleteRoomMock.mockClear();
    createMeetingTokenMock.mockClear();
    emitParticipantJoinedMock.mockClear();
    recordPayoutMock.mockClear();
    recordPayoutMock.mockResolvedValue(null);
    releasePayoutMock.mockClear();

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

    // required_fields_when_submitted CHECK constraint requires a category
    // once a learnRequest leaves DRAFT -- the gate tests push sessions all
    // the way to COMPLETED, which flips the learnRequest to COMPLETED too.
    const category = await prisma.category.create({
      data: { name: `Test Category ${suffix}`, slug: `test-category-${suffix}` },
    });
    categoryId = category.id;

    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title: 'Integration test job',
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
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, learnerId, outsiderId] } },
    });
  });

  describe('getSessionContext', () => {
    it('returns safe fields only, never the daily room columns', async () => {
      await sessions.provisionMeeting(sessionId);

      const context = await sessions.getSessionContext(learnerId, sessionId);
      const rawJson = JSON.stringify(context);

      expect(context.booking?.startTime.toISOString()).toBe(
        bookingStart.toISOString(),
      );
      expect(rawJson).not.toContain(testRoom.url);
      expect(rawJson).not.toContain('dailyRoomUrl');
      expect(rawJson).not.toContain('dailyRoomName');
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

    it('mints the tutor a token with is_owner true, computed server-side', async () => {
      await sessions.provisionMeeting(sessionId);

      await sessions.getMeetingDetails(tutorId, sessionId);

      expect(createMeetingTokenMock).toHaveBeenCalledWith(
        expect.objectContaining({ userId: tutorId, isOwner: true }),
      );
    });

    it("mints the learner a token with is_owner false -- never true, regardless of anything the caller could claim", async () => {
      await sessions.provisionMeeting(sessionId);

      await sessions.getMeetingDetails(learnerId, sessionId);

      expect(createMeetingTokenMock).toHaveBeenCalledWith(
        expect.objectContaining({ userId: learnerId, isOwner: false }),
      );
    });

    it('gives the tutor and the learner distinct join URLs', async () => {
      await sessions.provisionMeeting(sessionId);

      const tutorResponse = await sessions.getMeetingDetails(
        tutorId,
        sessionId,
      );
      const learnerResponse = await sessions.getMeetingDetails(
        learnerId,
        sessionId,
      );

      expect(tutorResponse.status).toBe('provisioned');
      expect(learnerResponse.status).toBe('provisioned');
      expect(
        tutorResponse.status === 'provisioned' && tutorResponse.joinUrl,
      ).not.toBe(
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
    it('is idempotent -- a second call does not re-create the room', async () => {
      await sessions.provisionMeeting(sessionId);
      await sessions.provisionMeeting(sessionId);

      expect(createRoomMock).toHaveBeenCalledTimes(1);
    });

    it('never throws when the Daily API call fails', async () => {
      createRoomMock.mockRejectedValue(new Error('Daily API unavailable'));

      await expect(sessions.provisionMeeting(sessionId)).resolves.toBeUndefined();

      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.dailyRoomUrl).toBeNull();
    });
  });

  describe('retryMeeting', () => {
    it('provisions a meeting for a session with no meeting yet', async () => {
      const result = await sessions.retryMeeting(tutorId, sessionId);
      expect(result).toMatchObject({ status: 'provisioned' });
      expect(createRoomMock).toHaveBeenCalledTimes(1);
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

  describe('recordVerifiedJoin', () => {
    it('sets tutorJoinedAt on first webhook delivery and does not overwrite it on a duplicate delivery', async () => {
      await sessions.provisionMeeting(sessionId);

      await sessions.recordVerifiedJoin(testRoom.name, tutorId);
      const first = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(first.tutorJoinedAt).not.toBeNull();

      // Daily may retry webhook delivery -- a duplicate must stay idempotent.
      await sessions.recordVerifiedJoin(testRoom.name, tutorId);
      const second = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(second.tutorJoinedAt?.toISOString()).toBe(
        first.tutorJoinedAt?.toISOString(),
      );
      expect(emitParticipantJoinedMock).toHaveBeenCalledTimes(1);
    });

    it('sets learnerJoinedAt independently of tutorJoinedAt', async () => {
      await sessions.provisionMeeting(sessionId);

      await sessions.recordVerifiedJoin(testRoom.name, learnerId);
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

    it('silently no-ops for a user_id that matches no participant', async () => {
      await sessions.provisionMeeting(sessionId);

      await expect(
        sessions.recordVerifiedJoin(testRoom.name, outsiderId),
      ).resolves.toBeUndefined();

      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.tutorJoinedAt).toBeNull();
      expect(session.learnerJoinedAt).toBeNull();
      expect(emitParticipantJoinedMock).not.toHaveBeenCalled();
    });

    it('silently no-ops for an unknown room name', async () => {
      await expect(
        sessions.recordVerifiedJoin('no-such-room', tutorId),
      ).resolves.toBeUndefined();
      expect(emitParticipantJoinedMock).not.toHaveBeenCalled();
    });
  });

  describe('confirmation gate', () => {
    beforeEach(async () => {
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'PENDING_REVIEW', tutorJoinedAt: new Date() },
      });
    });

    it('completes only once both independent branches resolve -- learner first', async () => {
      await sessions.confirmSession(learnerId, sessionId);
      let session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.status).toBe('PENDING_REVIEW');
      expect(session.learnerConfirmedAt).not.toBeNull();
      expect(session.summarySubmittedAt).toBeNull();

      await sessions.submitSessionSummary(tutorId, sessionId, 'Covered chapter 3.');
      session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
      expect(session.status).toBe('COMPLETED');
    });

    it('completes only once both independent branches resolve -- tutor first', async () => {
      await sessions.submitSessionSummary(tutorId, sessionId, 'Covered chapter 3.');
      let session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.status).toBe('PENDING_REVIEW');
      expect(session.learnerConfirmedAt).toBeNull();

      await sessions.confirmSession(learnerId, sessionId);
      session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
      expect(session.status).toBe('COMPLETED');
    });

    it('a dispute halts the gate permanently, even if a summary exists or is added afterward', async () => {
      await sessions.submitSessionSummary(tutorId, sessionId, 'Covered chapter 3.');
      await sessions.disputeSession(learnerId, sessionId, 'Tutor left early.');

      const session = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(session.status).toBe('PENDING_REVIEW');
      expect(session.disputedAt).not.toBeNull();
      expect(session.disputeReason).toBe('Tutor left early.');

      // Re-running the gate check directly (as the auto-resolve cron would)
      // must never complete a disputed session.
      await sessions.tryCompleteIfBothBranchesReady(sessionId);
      const after = await prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(after.status).toBe('PENDING_REVIEW');
    });

    it('rejects a second summary submission for the same session', async () => {
      await sessions.submitSessionSummary(tutorId, sessionId, 'First summary.');
      await expect(
        sessions.submitSessionSummary(tutorId, sessionId, 'Second summary.'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a second confirm/dispute response for the same session', async () => {
      await sessions.confirmSession(learnerId, sessionId);
      await expect(
        sessions.confirmSession(learnerId, sessionId),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        sessions.disputeSession(learnerId, sessionId, 'too late'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a learner submitting a summary and a tutor confirming/disputing', async () => {
      await expect(
        sessions.submitSessionSummary(learnerId, sessionId, 'not mine to submit'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        sessions.confirmSession(tutorId, sessionId),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        sessions.disputeSession(tutorId, sessionId, 'not mine to dispute'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a non-participant on all three actions', async () => {
      await expect(
        sessions.submitSessionSummary(outsiderId, sessionId, 'x'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        sessions.confirmSession(outsiderId, sessionId),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        sessions.disputeSession(outsiderId, sessionId, 'x'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects all three actions when the session is not awaiting review', async () => {
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'BOOKED' },
      });

      await expect(
        sessions.submitSessionSummary(tutorId, sessionId, 'x'),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        sessions.confirmSession(learnerId, sessionId),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        sessions.disputeSession(learnerId, sessionId, 'x'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
