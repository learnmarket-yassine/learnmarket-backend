import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HoldsService } from './services/holds.service';

describe('HoldsService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let holds: HoldsService;

  let tutorId: string;
  let learnerId: string;
  let sessionAId: string;
  let sessionBId: string;
  let proposalId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [PrismaService, HoldsService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    holds = moduleRef.get(HoldsService);
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
    proposalId = proposal.id;
    const [sessionA, sessionB] = await Promise.all([
      prisma.session.create({
        data: {
          proposalId: proposal.id,
          sessionNumber: 1,
          title: 'Session 1',
          status: 'PENDING_SCHEDULE',
        },
      }),
      prisma.session.create({
        data: {
          proposalId: proposal.id,
          sessionNumber: 2,
          title: 'Session 2',
          status: 'PENDING_SCHEDULE',
        },
      }),
    ]);
    sessionAId = sessionA.id;
    sessionBId = sessionB.id;
  });

  afterEach(async () => {
    await prisma.learnRequest.deleteMany({ where: { learnerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, learnerId] } },
    });
  });

  it('allows exactly one of two concurrent overlapping holds to succeed', async () => {
    const startTime = new Date('2027-01-01T10:00:00.000Z');
    const endTime = new Date('2027-01-01T11:00:00.000Z');
    const overlappingStart = new Date('2027-01-01T10:30:00.000Z');
    const overlappingEnd = new Date('2027-01-01T11:30:00.000Z');

    const results = await Promise.allSettled([
      holds.createSlotHold(tutorId, learnerId, sessionAId, startTime, endTime),
      holds.createSlotHold(
        tutorId,
        learnerId,
        sessionBId,
        overlappingStart,
        overlappingEnd,
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
  });

  it('does not let a stale ACTIVE hold (expired but not yet cleaned up) block a new overlapping hold', async () => {
    const startTime = new Date('2027-01-01T10:00:00.000Z');
    const endTime = new Date('2027-01-01T11:00:00.000Z');

    const hold = await holds.createSlotHold(
      tutorId,
      learnerId,
      sessionAId,
      startTime,
      endTime,
    );

    // Simulate a hold whose 10-minute window elapsed before the cleanup
    // cron (or the transactional cleanup in another createSlotHold call)
    // got to it: still ACTIVE in the DB, but expiresAt is in the past.
    await prisma.slotHold.update({
      where: { id: hold.id },
      data: { expiresAt: new Date(Date.now() - 1000), status: 'ACTIVE' },
    });

    const overlappingStart = new Date('2027-01-01T10:30:00.000Z');
    const overlappingEnd = new Date('2027-01-01T11:30:00.000Z');

    const newHold = await holds.createSlotHold(
      tutorId,
      learnerId,
      sessionBId,
      overlappingStart,
      overlappingEnd,
    );

    expect(newHold).toBeDefined();
    expect(newHold.status).toBe('ACTIVE');

    const staleHold = await prisma.slotHold.findUniqueOrThrow({
      where: { id: hold.id },
    });
    expect(staleHold.status).toBe('EXPIRED');
  });

  it('reuses the same SlotHold row across create -> release -> create for the same session', async () => {
    const startTime = new Date('2027-01-01T10:00:00.000Z');
    const endTime = new Date('2027-01-01T11:00:00.000Z');

    const first = await holds.createSlotHold(
      tutorId,
      learnerId,
      sessionAId,
      startTime,
      endTime,
    );
    await holds.releaseSlotHold(first.id);

    const newStart = new Date('2027-01-02T09:00:00.000Z');
    const newEnd = new Date('2027-01-02T10:00:00.000Z');
    const second = await holds.createSlotHold(
      tutorId,
      learnerId,
      sessionAId,
      newStart,
      newEnd,
    );

    expect(second.id).toBe(first.id);
    expect(second.status).toBe('ACTIVE');
    expect(second.startTime.toISOString()).toBe(newStart.toISOString());

    const rowCount = await prisma.slotHold.count({
      where: { sessionId: sessionAId },
    });
    expect(rowCount).toBe(1);
  });

  it('requestHold derives endTime from the proposal sessionDurationMinutes, not a fixed 60 minutes', async () => {
    await prisma.proposal.update({
      where: { id: proposalId },
      data: { sessionDurationMinutes: 45 },
    });

    const startTime = new Date('2027-01-01T10:00:00.000Z');
    const hold = await holds.requestHold(learnerId, {
      sessionId: sessionAId,
      startTime: startTime.toISOString(),
    });

    const expectedEnd = new Date(startTime.getTime() + 45 * 60_000);
    expect(hold.endTime.toISOString()).toBe(expectedEnd.toISOString());
    expect(hold.endTime.getTime() - hold.startTime.getTime()).toBe(45 * 60_000);
  });
});
