import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AvailabilityResolverService } from './availability-resolver.service';

describe('AvailabilityResolverService (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let resolver: AvailabilityResolverService;

  let tutorId: string;
  let learnerId: string;
  let sessionId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [PrismaService, AvailabilityResolverService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    resolver = moduleRef.get(AvailabilityResolverService);
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
      data: { learnerId, type: 'ONE_TIME', title: 'Availability integration test job' },
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
        status: 'PENDING_SCHEDULE',
      },
    });
    sessionId = session.id;
  });

  afterEach(async () => {
    jest.useRealTimers();
    await prisma.learnRequest.deleteMany({ where: { learnerId } });
    await prisma.user.deleteMany({ where: { id: { in: [tutorId, learnerId] } } });
  });

  it('produces byte-identical slots across two calls 90s apart, spanning a minute boundary (:49 -> :50)', async () => {
    const date = '2027-05-04'; // arbitrary Tuesday
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();

    await prisma.tutorAvailabilityRule.create({
      data: {
        tutorId,
        dayOfWeek: weekday,
        startTime: 0,
        endTime: 24 * 60,
        timezone: 'UTC',
        isActive: true,
      },
    });

    jest.useFakeTimers({ advanceTimers: false, doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });

    // Both calls land within the same 09:00-10:00 slot window, so no real
    // slot boundary is crossed between them -- only the wall-clock minute
    // ticks over. Under the old bug, the in-progress window's start got
    // clipped to `now`, so these two calls would have produced different
    // anchors (and therefore different slot timestamps for the whole day).
    jest.setSystemTime(new Date(`${date}T09:49:00.000Z`));
    const firstCall = await resolver.resolveAvailableSlots(tutorId, date, date, 60);

    jest.setSystemTime(new Date(`${date}T09:50:30.000Z`)); // +90s, crosses :49 -> :50
    const secondCall = await resolver.resolveAvailableSlots(tutorId, date, date, 60);

    expect(secondCall.map((d) => d.toISOString())).toEqual(
      firstCall.map((d) => d.toISOString()),
    );
    // Sanity: the grid is anchored to the rule, not to either `now` --
    // the next upcoming slot must start exactly on the hour.
    expect(firstCall[0].toISOString()).toBe(`${date}T10:00:00.000Z`);
  });

  it('excludes only slots whose start has already elapsed, filtered server-side after generation', async () => {
    const date = '2027-05-04';
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();

    await prisma.tutorAvailabilityRule.create({
      data: {
        tutorId,
        dayOfWeek: weekday,
        startTime: 0,
        endTime: 24 * 60,
        timezone: 'UTC',
        isActive: true,
      },
    });

    jest.useFakeTimers({ advanceTimers: false, doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    // Midway through the 10:00-11:00 slot: the 10:00 slot has already
    // started (elapsed), the 11:00 slot has not.
    jest.setSystemTime(new Date(`${date}T10:30:00.000Z`));

    const slots = await resolver.resolveAvailableSlots(tutorId, date, date, 60);
    const isoSlots = slots.map((d) => d.toISOString());

    expect(isoSlots).not.toContain(`${date}T10:00:00.000Z`);
    expect(isoSlots).toContain(`${date}T11:00:00.000Z`);
    expect(slots.every((s) => s.getTime() >= new Date(`${date}T10:30:00.000Z`).getTime())).toBe(
      true,
    );
  });

  it('generates correct UTC instants across a DST spring-forward transition (Europe/Paris)', async () => {
    // 2026-03-29 is the EU spring-forward date: 02:00 CET -> 03:00 CEST.
    // The rule's 09:00-17:00 window is entirely after the transition, so
    // the whole window must resolve using the CEST (UTC+2) offset.
    const date = '2026-03-29';
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();

    await prisma.tutorAvailabilityRule.create({
      data: {
        tutorId,
        dayOfWeek: weekday,
        startTime: 9 * 60,
        endTime: 17 * 60,
        timezone: 'Europe/Paris',
        isActive: true,
      },
    });

    jest.useFakeTimers({ advanceTimers: false, doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    jest.setSystemTime(new Date(`${date}T00:00:00.000Z`)); // well before the window, nothing elapsed

    const slots = await resolver.resolveAvailableSlots(tutorId, date, date, 60);
    const isoSlots = slots.map((d) => d.toISOString());

    expect(isoSlots[0]).toBe(`${date}T07:00:00.000Z`); // 09:00 CEST
    expect(isoSlots[isoSlots.length - 1]).toBe(`${date}T14:00:00.000Z`); // 16:00 CEST
    expect(isoSlots).toHaveLength(8);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].getTime() - slots[i - 1].getTime()).toBe(60 * 60_000);
    }
  });

  it('still excludes a slot covered by an active hold, unaffected by the anchor fix', async () => {
    const date = '2027-05-04';
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();

    await prisma.tutorAvailabilityRule.create({
      data: {
        tutorId,
        dayOfWeek: weekday,
        startTime: 0,
        endTime: 24 * 60,
        timezone: 'UTC',
        isActive: true,
      },
    });

    jest.useFakeTimers({ advanceTimers: false, doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    jest.setSystemTime(new Date(`${date}T00:00:00.000Z`));

    const before = (await resolver.resolveAvailableSlots(tutorId, date, date, 60)).map((d) =>
      d.toISOString(),
    );
    expect(before).toContain(`${date}T10:00:00.000Z`);

    // Simulate a competing hold placed on the 10:00 slot between the two polls.
    await prisma.slotHold.create({
      data: {
        tutorId,
        learnerId,
        sessionId,
        startTime: new Date(`${date}T10:00:00.000Z`),
        endTime: new Date(`${date}T11:00:00.000Z`),
        status: 'ACTIVE',
        expiresAt: new Date(`${date}T00:10:00.000Z`),
      },
    });

    const after = (await resolver.resolveAvailableSlots(tutorId, date, date, 60)).map((d) =>
      d.toISOString(),
    );
    expect(after).not.toContain(`${date}T10:00:00.000Z`);
    expect(after).toContain(`${date}T09:00:00.000Z`);
    expect(after).toContain(`${date}T11:00:00.000Z`);
  });
});
