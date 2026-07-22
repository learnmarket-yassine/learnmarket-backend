import { Test, TestingModule } from '@nestjs/testing';
import {
  LearnRequestStatus,
  ProposalStatus,
  SessionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProposalsService } from './proposals.service';

describe('ProposalsService.accept (integration, real DB)', () => {
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
      providers: [PrismaService, ProposalsService],
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

    await proposals.accept(learnerId, accepted.id);

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

    await expect(proposals.accept(learnerId, accepted.id)).rejects.toThrow();

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
});
