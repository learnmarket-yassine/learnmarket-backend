import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';

describe('db-extras.sql constraints (integration, real DB, raw inserts bypassing the app layer)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  let tutorId: string;
  let learnerId: string;
  let categoryId: string;
  let learnRequestId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [tutor, learner, category] = await Promise.all([
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
      prisma.category.create({
        data: { name: `Category ${suffix}`, slug: `category-${suffix}` },
      }),
    ]);
    tutorId = tutor.id;
    learnerId = learner.id;
    categoryId = category.id;

    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title: 'Constraint test request',
        status: 'OPEN',
        categoryId,
      },
    });
    learnRequestId = learnRequest.id;
  });

  afterEach(async () => {
    await prisma.learnRequest.deleteMany({ where: { learnerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, learnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it('session_duration_positive rejects a non-positive duration on a raw insert', async () => {
    await expect(
      prisma.proposal.create({
        data: {
          learnRequestId,
          tutorId,
          sessionDurationMinutes: 0,
          totalPrice: 50,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.proposal.create({
        data: {
          learnRequestId,
          tutorId,
          sessionDurationMinutes: -15,
          totalPrice: 50,
        },
      }),
    ).rejects.toThrow();
  });

  it('one_active_proposal_per_tutor rejects a second PENDING proposal from the same tutor on the same request', async () => {
    await prisma.proposal.create({
      data: {
        learnRequestId,
        tutorId,
        sessionDurationMinutes: 60,
        totalPrice: 50,
        status: 'PENDING',
      },
    });

    await expect(
      prisma.proposal.create({
        data: {
          learnRequestId,
          tutorId,
          sessionDurationMinutes: 60,
          totalPrice: 50,
          status: 'PENDING',
        },
      }),
    ).rejects.toThrow();
  });

  it('one_accepted_proposal_per_request rejects a second ACCEPTED proposal on the same request', async () => {
    const otherTutor = await prisma.user.create({
      data: {
        email: `other-tutor-${Date.now()}@test.local`,
        password: 'x',
        firstname: 'T2',
        lastname: 'Tutor',
        role: 'TUTOR',
      },
    });

    await prisma.proposal.create({
      data: {
        learnRequestId,
        tutorId,
        sessionDurationMinutes: 60,
        totalPrice: 50,
        status: 'ACCEPTED',
      },
    });

    await expect(
      prisma.proposal.create({
        data: {
          learnRequestId,
          tutorId: otherTutor.id,
          sessionDurationMinutes: 60,
          totalPrice: 50,
          status: 'ACCEPTED',
        },
      }),
    ).rejects.toThrow();

    await prisma.user.delete({ where: { id: otherTutor.id } });
  });

  it('slot_holds/bookings have no fixed-60-minute CHECK constraint -- a non-60-minute row inserts cleanly', async () => {
    const proposal = await prisma.proposal.create({
      data: {
        learnRequestId,
        tutorId,
        sessionDurationMinutes: 45,
        totalPrice: 50,
      },
    });
    const session = await prisma.session.create({
      data: { proposalId: proposal.id, sessionNumber: 1, title: 'Session 1' },
    });

    const startTime = new Date('2027-02-01T10:00:00.000Z');
    const endTime = new Date('2027-02-01T10:45:00.000Z'); // 45 minutes, not 60

    const hold = await prisma.slotHold.create({
      data: {
        tutorId,
        learnerId,
        sessionId: session.id,
        startTime,
        endTime,
        expiresAt: new Date(Date.now() + 60_000),
        status: 'EXPIRED', // avoid tripping the overlap exclusion constraint
      },
    });
    expect(hold.endTime.getTime() - hold.startTime.getTime()).toBe(45 * 60_000);

    const booking = await prisma.booking.create({
      data: {
        tutorId,
        learnerId,
        sessionId: session.id,
        startTime,
        endTime,
        status: 'CANCELLED', // avoid tripping the overlap exclusion constraint
      },
    });
    expect(booking.endTime.getTime() - booking.startTime.getTime()).toBe(
      45 * 60_000,
    );
  });
});
