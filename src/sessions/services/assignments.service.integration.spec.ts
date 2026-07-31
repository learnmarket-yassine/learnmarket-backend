import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../storage/upload.service';
import { SessionsGateway } from '../gateways/sessions.gateway';
import { AssignmentsService } from './assignments.service';
import { SessionsService } from './sessions.service';
import { DailyService } from './daily.service';
import { PayoutsService } from '../../payments/services/payouts.service';

describe('AssignmentsService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let assignments: AssignmentsService;

  let tutorId: string;
  let learnerId: string;
  let outsiderId: string;
  let sessionId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        SessionsService,
        AssignmentsService,
        { provide: DailyService, useValue: {} },
        {
          provide: UploadService,
          useValue: {
            finalize: jest.fn(),
            presign: jest.fn(),
            deleteIfPresent: jest.fn(),
            getSignedDownloadUrl: jest.fn(),
          },
        },
        { provide: SessionsGateway, useValue: { emitParticipantJoined: jest.fn() } },
        { provide: PayoutsService, useValue: {} },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    assignments = moduleRef.get(AssignmentsService);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
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

    await prisma.booking.create({
      data: {
        tutorId,
        learnerId,
        sessionId,
        startTime: new Date(Date.now() - 5 * 60_000),
        endTime: new Date(Date.now() + 55 * 60_000),
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

  describe('create', () => {
    it('lets the tutor create an assignment with a default ASSIGNED submission', async () => {
      const result = await assignments.create(tutorId, sessionId, {
        title: 'Worksheet 1',
      });
      expect(result.exists).toBe(true);
      expect(result.submission?.status).toBe('ASSIGNED');
      expect(result.displayStatus).toBe('ASSIGNED');
    });

    it('rejects the learner creating an assignment (wrong role)', async () => {
      await expect(
        assignments.create(learnerId, sessionId, { title: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 404 for a non-participant', async () => {
      await expect(
        assignments.create(outsiderId, sessionId, { title: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects creating a second assignment on the same session with a clean 409', async () => {
      await assignments.create(tutorId, sessionId, { title: 'Worksheet 1' });
      await expect(
        assignments.create(tutorId, sessionId, { title: 'Worksheet 2' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('get', () => {
    it('returns { exists: false } when no assignment has been posted', async () => {
      const result = await assignments.get(tutorId, sessionId);
      expect(result).toEqual({ exists: false });
    });

    it('returns 404 for a non-participant', async () => {
      await expect(assignments.get(outsiderId, sessionId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('computes LATE when dueAt is in the past and status is still ASSIGNED, without storing it', async () => {
      await assignments.create(tutorId, sessionId, {
        title: 'Worksheet 1',
        dueAt: new Date(Date.now() - 60_000),
      });

      const result = await assignments.get(learnerId, sessionId);
      expect(result.exists).toBe(true);
      expect(result.displayStatus).toBe('LATE');

      const raw = await prisma.assignmentSubmission.findFirstOrThrow({
        where: { assignment: { sessionId } },
      });
      expect(raw.status).toBe('ASSIGNED');
    });
  });

  describe('update', () => {
    it('succeeds while the submission is still ASSIGNED', async () => {
      await assignments.create(tutorId, sessionId, { title: 'Original' });
      const updated = await assignments.update(tutorId, sessionId, {
        title: 'Updated title',
      });
      expect(updated.title).toBe('Updated title');
    });

    it('is rejected once the submission has been SUBMITTED', async () => {
      const created = await assignments.create(tutorId, sessionId, { title: 'Original' });
      await assignments.completeSubmission(learnerId, created.id);

      await expect(
        assignments.update(tutorId, sessionId, { title: 'Too late' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects the learner editing (wrong role)', async () => {
      await assignments.create(tutorId, sessionId, { title: 'Original' });
      await expect(
        assignments.update(learnerId, sessionId, { title: 'Nope' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('submission workflow', () => {
    it('lets the learner complete the submission while ASSIGNED', async () => {
      const created = await assignments.create(tutorId, sessionId, { title: 'W' });
      const result = await assignments.completeSubmission(learnerId, created.id);
      expect(result.status).toBe('SUBMITTED');
      expect(result.submittedAt).not.toBeNull();
    });

    it('rejects completing an already-SUBMITTED submission', async () => {
      const created = await assignments.create(tutorId, sessionId, { title: 'W' });
      await assignments.completeSubmission(learnerId, created.id);

      await expect(
        assignments.completeSubmission(learnerId, created.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects the tutor completing a submission (wrong role)', async () => {
      const created = await assignments.create(tutorId, sessionId, { title: 'W' });
      await expect(
        assignments.completeSubmission(tutorId, created.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets the tutor excuse a submission from ASSIGNED', async () => {
      const created = await assignments.create(tutorId, sessionId, { title: 'W' });
      const result = await assignments.excuseSubmission(tutorId, created.id);
      expect(result.status).toBe('EXCUSED');
    });

    it('rejects excusing an already-SUBMITTED submission', async () => {
      const created = await assignments.create(tutorId, sessionId, { title: 'W' });
      await assignments.completeSubmission(learnerId, created.id);

      await expect(
        assignments.excuseSubmission(tutorId, created.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 404 for a non-participant on any submission action', async () => {
      const created = await assignments.create(tutorId, sessionId, { title: 'W' });
      await expect(
        assignments.completeSubmission(outsiderId, created.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects adding a submission attachment once already SUBMITTED', async () => {
      const created = await assignments.create(tutorId, sessionId, { title: 'W' });
      await assignments.completeSubmission(learnerId, created.id);

      await expect(
        assignments.addSubmissionAttachment(learnerId, created.id, {
          key: 'submission-attachments/x/f.pdf',
          fileName: 'f.pdf',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects removing a submission attachment once already SUBMITTED', async () => {
      const created = await assignments.create(tutorId, sessionId, { title: 'W' });
      const submission = await prisma.assignmentSubmission.findUniqueOrThrow({
        where: { assignmentId: created.id },
      });
      const attachment = await prisma.submissionAttachment.create({
        data: {
          submissionId: submission.id,
          key: 'submission-attachments/x/f.pdf',
          fileName: 'f.pdf',
        },
      });
      await assignments.completeSubmission(learnerId, created.id);

      await expect(
        assignments.removeSubmissionAttachment(learnerId, created.id, attachment.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
