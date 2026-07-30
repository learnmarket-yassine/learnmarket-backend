import { Test, TestingModule } from '@nestjs/testing';
import {
  LearnRequestStatus,
  ProposalStatus,
  SessionStatus,
  TutorVerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../../messaging/services/messaging.service';
import { SparksService } from '../../sparks/services/sparks.service';
import { ProposalsService } from './proposals.service';

describe('ProposalsService.runAcceptTransaction (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let proposals: ProposalsService;

  let tutorId: string;
  let otherTutorId: string;
  let learnerId: string;
  let categoryId: string;
  let learnRequestId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        ProposalsService,
        {
          provide: MessagingService,
          useValue: { recomputeConversationActiveState: jest.fn() },
        },
        {
          provide: SparksService,
          useValue: { spendSparksForProposal: jest.fn() },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    proposals = moduleRef.get(ProposalsService);
    await moduleRef.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const [tutor, otherTutor, learner, category] = await Promise.all([
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
          email: `other-tutor-${suffix}@test.local`,
          password: 'x',
          firstname: 'T2',
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
    otherTutorId = otherTutor.id;
    learnerId = learner.id;
    categoryId = category.id;

    await prisma.tutorProfile.createMany({
      data: [tutorId, otherTutorId].map((userId) => ({
        userId,
        verificationStatus: TutorVerificationStatus.APPROVED,
      })),
    });

    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'COURSE',
        title: 'Course request',
        status: LearnRequestStatus.OPEN,
        categoryId,
      },
    });
    learnRequestId = learnRequest.id;
  });

  afterEach(async () => {
    await prisma.learnRequest.deleteMany({ where: { learnerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, otherTutorId, learnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  // Mirrors how the payment_intent.succeeded webhook handler actually
  // invokes this -- inside its own $transaction, with no learnerId in
  // scope.
  async function accept(_learnerId: string, proposalId: string) {
    return prisma.$transaction((tx) =>
      proposals.runAcceptTransaction(tx, proposalId),
    );
  }

  async function createProposal(forTutorId: string) {
    return proposals.create(forTutorId, learnRequestId, {
      sessionDurationMinutes: 60,
      totalPrice: 150,
      sessionPlans: [
        { title: 'Session 1' },
        { title: 'Session 2' },
        { title: 'Session 3' },
      ],
    });
  }

  it('creates Session rows (1 -> PENDING_SCHEDULE, rest -> LOCKED), closes the learn request, and declines every other PENDING proposal, all atomically', async () => {
    const accepted = await createProposal(tutorId);
    const other = await createProposal(otherTutorId);

    await accept(learnerId, accepted.id);

    const sessions = await prisma.session.findMany({
      where: { proposalId: accepted.id },
      orderBy: { sessionNumber: 'asc' },
    });
    expect(sessions).toHaveLength(3);
    expect(sessions[0].status).toBe(SessionStatus.PENDING_SCHEDULE);
    expect(sessions[1].status).toBe(SessionStatus.LOCKED);
    expect(sessions[2].status).toBe(SessionStatus.LOCKED);

    const learnRequest = await prisma.learnRequest.findUniqueOrThrow({
      where: { id: learnRequestId },
    });
    expect(learnRequest.status).toBe(LearnRequestStatus.CLOSED);

    const acceptedProposal = await prisma.proposal.findUniqueOrThrow({
      where: { id: accepted.id },
    });
    expect(acceptedProposal.status).toBe(ProposalStatus.ACCEPTED);

    const otherProposal = await prisma.proposal.findUniqueOrThrow({
      where: { id: other.id },
    });
    expect(otherProposal.status).toBe(ProposalStatus.DECLINED);
  });

  it('rolls back everything (proposal status, learn request status, other proposals, Session rows) if the transaction fails partway through', async () => {
    const accepted = await createProposal(tutorId);
    const other = await createProposal(otherTutorId);

    // Sabotage: pre-create a Session row that collides with the
    // (proposalId, sessionNumber) unique constraint the acceptance
    // transaction will hit when it creates sessions for `accepted`.
    // This forces tx.session.createMany to fail mid-transaction.
    await prisma.session.create({
      data: {
        proposalId: accepted.id,
        sessionNumber: 2,
        title: 'Pre-existing collider',
      },
    });

    await expect(accept(learnerId, accepted.id)).rejects.toThrow();

    const acceptedProposal = await prisma.proposal.findUniqueOrThrow({
      where: { id: accepted.id },
    });
    expect(acceptedProposal.status).toBe(ProposalStatus.PENDING);

    const otherProposal = await prisma.proposal.findUniqueOrThrow({
      where: { id: other.id },
    });
    expect(otherProposal.status).toBe(ProposalStatus.PENDING);

    const learnRequest = await prisma.learnRequest.findUniqueOrThrow({
      where: { id: learnRequestId },
    });
    expect(learnRequest.status).toBe(LearnRequestStatus.OPEN);

    // Only the one sabotage row should exist -- the createMany's other
    // rows must not have partially committed.
    const sessions = await prisma.session.findMany({
      where: { proposalId: accepted.id },
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe('Pre-existing collider');
  });

  it('never lets two proposals on the same learn request both get accepted under concurrent accept() calls', async () => {
    const first = await createProposal(tutorId);
    const second = await createProposal(otherTutorId);

    const results = await Promise.allSettled([
      accept(learnerId, first.id),
      accept(learnerId, second.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const acceptedCount = await prisma.proposal.count({
      where: { learnRequestId, status: ProposalStatus.ACCEPTED },
    });
    expect(acceptedCount).toBe(1);

    // The loser must not have been silently overwritten to ACCEPTED --
    // it's either still PENDING (lost the race before the transaction
    // ran) or DECLINED (the winner's transaction declined it).
    const proposalsRows = await prisma.proposal.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    for (const row of proposalsRows) {
      expect([
        ProposalStatus.ACCEPTED,
        ProposalStatus.PENDING,
        ProposalStatus.DECLINED,
      ]).toContain(row.status);
    }
    expect(
      proposalsRows.filter((row) => row.status === ProposalStatus.ACCEPTED),
    ).toHaveLength(1);
  });
});
