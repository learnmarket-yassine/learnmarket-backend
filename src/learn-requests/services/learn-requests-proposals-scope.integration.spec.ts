import { PrismaClient } from '@prisma/client';
import {
  LearnRequestStatus,
  Prisma,
  ProposalStatus,
  UserRole,
} from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { LearnRequestsService } from './learn-requests.service';

describe('LearnRequestsService.findMany proposals scoping (integration, real DB)', () => {
  // A plain PrismaClient (not the NestJS-wrapped PrismaService) so query
  // events can be captured with `emit: 'event'` -- PrismaService is
  // hardcoded to stdout logging in dev, which can't be counted.
  const prisma = new PrismaClient({
    log: [{ emit: 'event', level: 'query' }],
  });
  let queryEvents: Prisma.QueryEvent[] = [];
  prisma.$on('query' as never, (event: Prisma.QueryEvent) => {
    queryEvents.push(event);
  });

  const service = new LearnRequestsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  let tutorAId: string;
  let tutorBId: string;
  let learnerId: string;
  let categoryId: string;

  function authUser(id: string, role: UserRole): AuthUser {
    return { id, email: `${id}@test.local`, role };
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    queryEvents = [];
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const [tutorA, tutorB, learner, category] = await Promise.all([
      prisma.user.create({
        data: {
          email: `tutor-a-${suffix}@test.local`,
          password: 'x',
          firstname: 'A',
          lastname: 'Tutor',
          role: 'TUTOR',
        },
      }),
      prisma.user.create({
        data: {
          email: `tutor-b-${suffix}@test.local`,
          password: 'x',
          firstname: 'B',
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
    tutorAId = tutorA.id;
    tutorBId = tutorB.id;
    learnerId = learner.id;
    categoryId = category.id;
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [tutorAId, tutorBId, learnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  async function makeOpenRequest(title: string) {
    return prisma.learnRequest.create({
      data: {
        learnerId,
        type: 'ONE_TIME',
        title,
        status: LearnRequestStatus.OPEN,
        categoryId,
      },
    });
  }

  async function makeProposal(
    learnRequestId: string,
    tutorId: string,
    status: ProposalStatus,
  ) {
    return prisma.proposal.create({
      data: {
        learnRequestId,
        tutorId,
        status,
        sessionDurationMinutes: 60,
        totalPrice: 50,
        sessionPlans: { create: [{ sessionNumber: 1, title: 'Session 1' }] },
      },
    });
  }

  it("scopes a TUTOR's browse feed to only their own proposal(s) per request, never another tutor's", async () => {
    const requestOne = await makeOpenRequest('Request one');
    const requestTwo = await makeOpenRequest('Request two');
    await Promise.all([
      makeProposal(requestOne.id, tutorAId, ProposalStatus.PENDING),
      makeProposal(requestOne.id, tutorBId, ProposalStatus.PENDING),
      makeProposal(requestTwo.id, tutorBId, ProposalStatus.PENDING),
    ]);

    const { paginatedResult } = await service.findMany(
      authUser(tutorAId, UserRole.TUTOR),
      { page: 0, take: 50 },
    );

    const one = paginatedResult.find((item) => item.id === requestOne.id)!;
    const two = paginatedResult.find((item) => item.id === requestTwo.id)!;
    expect(one.proposals).toHaveLength(1);
    expect(one.proposals[0].tutorId).toBe(tutorAId);
    expect(two.proposals).toHaveLength(0);
  });

  it('shows a resubmitting TUTOR both their historical proposals on the same request, newest first', async () => {
    const request = await makeOpenRequest('Resubmission request');
    const declined = await makeProposal(
      request.id,
      tutorAId,
      ProposalStatus.DECLINED,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const resubmitted = await makeProposal(
      request.id,
      tutorAId,
      ProposalStatus.PENDING,
    );

    const { paginatedResult } = await service.findMany(
      authUser(tutorAId, UserRole.TUTOR),
      { page: 0, take: 50 },
    );

    const item = paginatedResult.find((r) => r.id === request.id)!;
    expect(item.proposals.map((p) => p.id)).toEqual([
      resubmitted.id,
      declined.id,
    ]);
  });

  it('shows the owning LEARNER every proposal from every tutor, full detail', async () => {
    const request = await makeOpenRequest('Learner dashboard request');
    await Promise.all([
      makeProposal(request.id, tutorAId, ProposalStatus.PENDING),
      makeProposal(request.id, tutorBId, ProposalStatus.PENDING),
    ]);

    const { paginatedResult } = await service.findMany(
      authUser(learnerId, UserRole.LEARNER),
      { page: 0, take: 50 },
    );

    const item = paginatedResult.find((r) => r.id === request.id)!;
    const tutorIds = item.proposals.map((p) => p.tutorId).sort();
    expect(tutorIds).toEqual([tutorAId, tutorBId].sort());
    expect(item.proposals[0].sessionPlans).toHaveLength(1);
    expect(typeof item.proposals[0].tutor.id).toBe('string');
  });

  it('resolves nested proposals/sessionPlans/tutor without N+1: query count stays flat as row count grows', async () => {
    const requests = await Promise.all(
      Array.from({ length: 5 }, (_, i) => makeOpenRequest(`Bulk request ${i}`)),
    );
    await Promise.all(
      requests.map((r) => makeProposal(r.id, tutorAId, ProposalStatus.PENDING)),
    );

    queryEvents = [];
    await service.findMany(authUser(tutorAId, UserRole.TUTOR), {
      page: 0,
      take: 50,
      categoryId,
    });
    const queryCountForFive = queryEvents.length;

    const singleRequest = await makeOpenRequest('Single request');
    await makeProposal(singleRequest.id, tutorAId, ProposalStatus.PENDING);

    queryEvents = [];
    await service.findMany(authUser(tutorAId, UserRole.TUTOR), {
      page: 0,
      take: 1,
      categoryId,
    });
    const queryCountForOne = queryEvents.length;

    // Same query count regardless of row count proves the nested relations
    // are resolved via a fixed number of batched queries (Prisma's
    // WHERE-IN strategy), not one extra round-trip per row.
    expect(queryCountForFive).toBe(queryCountForOne);
  });
});
