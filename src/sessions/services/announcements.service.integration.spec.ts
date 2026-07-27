import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadService } from '../../storage/upload.service';
import { SessionsGateway } from '../gateways/sessions.gateway';
import { AnnouncementsService } from './announcements.service';
import { SessionsService } from './sessions.service';
import { ZoomService } from './zoom.service';

describe('AnnouncementsService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let announcements: AnnouncementsService;

  let tutorId: string;
  let learnerId: string;
  let outsiderId: string;
  let sessionId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        SessionsService,
        AnnouncementsService,
        { provide: ZoomService, useValue: {} },
        {
          provide: UploadService,
          useValue: {
            finalize: jest.fn(),
            deleteIfPresent: jest.fn(),
            getSignedDownloadUrl: jest.fn(),
          },
        },
        { provide: SessionsGateway, useValue: { emitParticipantJoined: jest.fn() } },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    announcements = moduleRef.get(AnnouncementsService);
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

  describe('update', () => {
    it('lets the author edit their own announcement', async () => {
      const created = await announcements.create(tutorId, sessionId, {
        content: 'original',
      });
      const updated = await announcements.update(tutorId, created.id, {
        content: 'edited',
      });
      expect(updated.content).toBe('edited');
    });

    it('rejects editing someone else\'s announcement', async () => {
      const created = await announcements.create(tutorId, sessionId, {
        content: 'original',
      });
      await expect(
        announcements.update(learnerId, created.id, { content: 'hijacked' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 404 for a non-participant', async () => {
      const created = await announcements.create(tutorId, sessionId, {
        content: 'original',
      });
      await expect(
        announcements.update(outsiderId, created.id, { content: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('lets the author delete their own announcement', async () => {
      const created = await announcements.create(learnerId, sessionId, {
        content: 'to delete',
      });
      await announcements.remove(learnerId, created.id);

      const remaining = await prisma.announcement.findUnique({
        where: { id: created.id },
      });
      expect(remaining).toBeNull();
    });

    it('rejects deleting someone else\'s announcement', async () => {
      const created = await announcements.create(tutorId, sessionId, {
        content: 'not yours',
      });
      await expect(
        announcements.remove(learnerId, created.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 404 for a non-participant', async () => {
      const created = await announcements.create(tutorId, sessionId, {
        content: 'x',
      });
      await expect(
        announcements.remove(outsiderId, created.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
