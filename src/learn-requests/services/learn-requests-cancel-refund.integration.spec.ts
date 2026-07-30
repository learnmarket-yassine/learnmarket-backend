import { ConflictException } from '@nestjs/common';
import { PrismaClient, SparksTransactionType } from '@prisma/client';
import { LearnRequestsService } from './learn-requests.service';
import { SparksService } from '../../sparks/services/sparks.service';

describe('LearnRequestsService.cancel Sparks refund (integration, real DB)', () => {
  const prisma = new PrismaClient();
  const sparks = new SparksService(prisma as never, {} as never);
  const service = new LearnRequestsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    sparks,
  );

  let tutorId: string;
  let otherTutorId: string;
  let learnerId: string;
  let categoryId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
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
          email: `tutor-b-${suffix}@test.local`,
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

    await Promise.all([
      prisma.tutorProfile.create({ data: { userId: tutorId } }),
      prisma.tutorProfile.create({ data: { userId: otherTutorId } }),
    ]);
  });

  afterEach(async () => {
    await prisma.learnRequest.deleteMany({ where: { learnerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, otherTutorId, learnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it('cancelling an OPEN learn request refunds Sparks for every still-PENDING proposal on it', async () => {
    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title: 'Request',
        status: 'OPEN',
        categoryId,
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
    await prisma.tutorProfile.update({
      where: { userId: tutorId },
      data: { sparksBalance: 10 },
    });
    await prisma.$transaction((tx) =>
      sparks.spendSparksForProposal(tx, tutorId, proposal.id),
    );
    const balanceAfterSpend = await prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: tutorId },
    });
    expect(balanceAfterSpend.sparksBalance).toBe(6);

    await service.cancel(learnerId, learnRequest.id);

    const balanceAfterCancel = await prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: tutorId },
    });
    expect(balanceAfterCancel.sparksBalance).toBe(10);

    const refunds = await prisma.sparksTransaction.findMany({
      where: { tutorId, type: SparksTransactionType.REFUND, proposalId: proposal.id },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount).toBe(4);

    const cancelledRequest = await prisma.learnRequest.findUniqueOrThrow({
      where: { id: learnRequest.id },
    });
    expect(cancelledRequest.status).toBe('CANCELLED');
  });

  it('cancelling refunds every still-PENDING proposal but a DECLINED proposal on the same request is never refunded', async () => {
    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title: 'Request',
        status: 'OPEN',
        categoryId,
      },
    });
    const pendingProposal = await prisma.proposal.create({
      data: {
        learnRequestId: learnRequest.id,
        tutorId,
        sessionDurationMinutes: 60,
        totalPrice: 100,
      },
    });
    const declinedProposal = await prisma.proposal.create({
      data: {
        learnRequestId: learnRequest.id,
        tutorId: otherTutorId,
        sessionDurationMinutes: 60,
        totalPrice: 100,
        status: 'DECLINED',
      },
    });
    await prisma.tutorProfile.updateMany({
      where: { userId: { in: [tutorId, otherTutorId] } },
      data: { sparksBalance: 10 },
    });
    await prisma.$transaction((tx) =>
      sparks.spendSparksForProposal(tx, tutorId, pendingProposal.id),
    );
    await prisma.$transaction((tx) =>
      sparks.spendSparksForProposal(tx, otherTutorId, declinedProposal.id),
    );

    await service.cancel(learnerId, learnRequest.id);

    const pendingTutorBalance = await prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: tutorId },
    });
    expect(pendingTutorBalance.sparksBalance).toBe(10); // refunded

    const declinedTutorBalance = await prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: otherTutorId },
    });
    expect(declinedTutorBalance.sparksBalance).toBe(6); // NOT refunded -- still spent

    const declinedRefunds = await prisma.sparksTransaction.findMany({
      where: {
        tutorId: otherTutorId,
        type: SparksTransactionType.REFUND,
      },
    });
    expect(declinedRefunds).toHaveLength(0);
  });

  it('rejects cancelling a learn request that is not OPEN, without refunding anything', async () => {
    const learnRequest = await prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title: 'Request',
        status: 'CLOSED',
        categoryId,
      },
    });

    await expect(service.cancel(learnerId, learnRequest.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
