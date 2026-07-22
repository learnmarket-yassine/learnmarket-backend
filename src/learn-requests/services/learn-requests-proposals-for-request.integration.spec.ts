import { PrismaClient } from '@prisma/client';
import { LearnRequestStatus, ProposalStatus, UserRole } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { LearnRequestsService } from './learn-requests.service';

describe('LearnRequestsService.findProposalsForRequest (integration, real DB)', () => {
  const prisma = new PrismaClient();
  const service = new LearnRequestsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );

  let tutorAId: string;
  let tutorBId: string;
  let learnerId: string;
  let otherLearnerId: string;
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
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const [tutorA, tutorB, learner, otherLearner, category] = await Promise.all(
      [
        prisma.user.create({
          data: {
            email: `tutor-a-${suffix}@test.local`,
            password: 'x',
            firstname: 'Alice',
            lastname: 'Tutor',
            role: 'TUTOR',
          },
        }),
        prisma.user.create({
          data: {
            email: `tutor-b-${suffix}@test.local`,
            password: 'x',
            firstname: 'Bob',
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
            email: `other-learner-${suffix}@test.local`,
            password: 'x',
            firstname: 'O',
            lastname: 'Learner',
            role: 'LEARNER',
          },
        }),
        prisma.category.create({
          data: { name: `Category ${suffix}`, slug: `category-${suffix}` },
        }),
      ],
    );
    tutorAId = tutorA.id;
    tutorBId = tutorB.id;
    learnerId = learner.id;
    otherLearnerId = otherLearner.id;
    categoryId = category.id;
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [tutorAId, tutorBId, learnerId, otherLearnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  async function makeRequest(
    status: LearnRequestStatus,
    forLearnerId = learnerId,
  ) {
    return prisma.learnRequest.create({
      data: {
        learnerId: forLearnerId,
        type: 'ONE_TIME',
        title: 'Request',
        status,
        categoryId,
      },
    });
  }

  async function makeProposal(
    learnRequestId: string,
    tutorId: string,
    status: ProposalStatus = ProposalStatus.PENDING,
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

  it('gives the owning LEARNER every proposal on their request', async () => {
    const request = await makeRequest(LearnRequestStatus.OPEN);
    await Promise.all([
      makeProposal(request.id, tutorAId),
      makeProposal(request.id, tutorBId),
    ]);

    const result = await service.findProposalsForRequest(
      authUser(learnerId, UserRole.LEARNER),
      request.id,
      { page: 0, take: 5 },
    );

    expect(result.totalCount).toBe(2);
    expect(result.paginatedResult.map((p) => p.tutorId).sort()).toEqual(
      [tutorAId, tutorBId].sort(),
    );
  });

  it("scopes a TUTOR to only their own proposal(s), never another tutor's", async () => {
    const request = await makeRequest(LearnRequestStatus.OPEN);
    await Promise.all([
      makeProposal(request.id, tutorAId),
      makeProposal(request.id, tutorBId),
    ]);

    const result = await service.findProposalsForRequest(
      authUser(tutorAId, UserRole.TUTOR),
      request.id,
      { page: 0, take: 5 },
    );

    expect(result.totalCount).toBe(1);
    expect(result.paginatedResult[0].tutorId).toBe(tutorAId);
  });

  it('gives a TUTOR who never proposed an empty result, not a 404', async () => {
    const request = await makeRequest(LearnRequestStatus.OPEN);
    await makeProposal(request.id, tutorBId);

    const result = await service.findProposalsForRequest(
      authUser(tutorAId, UserRole.TUTOR),
      request.id,
      { page: 0, take: 5 },
    );

    expect(result.totalCount).toBe(0);
    expect(result.paginatedResult).toEqual([]);
  });

  it('404s a TUTOR viewing a non-OPEN request, never 403', async () => {
    const request = await makeRequest(LearnRequestStatus.CLOSED);

    await expect(
      service.findProposalsForRequest(
        authUser(tutorAId, UserRole.TUTOR),
        request.id,
        {
          page: 0,
          take: 5,
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("404s a LEARNER viewing a request they don't own, never 403", async () => {
    const request = await makeRequest(LearnRequestStatus.OPEN);

    await expect(
      service.findProposalsForRequest(
        authUser(otherLearnerId, UserRole.LEARNER),
        request.id,
        { page: 0, take: 5 },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters by tutor name server-side, across the full result set (not one client page)', async () => {
    const request = await makeRequest(LearnRequestStatus.OPEN);
    await Promise.all([
      makeProposal(request.id, tutorAId), // Alice Tutor
      makeProposal(request.id, tutorBId), // Bob Tutor
    ]);

    const result = await service.findProposalsForRequest(
      authUser(learnerId, UserRole.LEARNER),
      request.id,
      { page: 0, take: 1, search: 'bob' },
    );

    expect(result.totalCount).toBe(1);
    expect(result.paginatedResult[0].tutorId).toBe(tutorBId);
  });

  it('paginates results with take/page', async () => {
    const request = await makeRequest(LearnRequestStatus.OPEN);
    const extraTutors = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        prisma.user.create({
          data: {
            email: `extra-${i}-${Date.now()}@test.local`,
            password: 'x',
            firstname: `Extra${i}`,
            lastname: 'Tutor',
            role: 'TUTOR',
          },
        }),
      ),
    );
    await Promise.all(extraTutors.map((t) => makeProposal(request.id, t.id)));

    const page0 = await service.findProposalsForRequest(
      authUser(learnerId, UserRole.LEARNER),
      request.id,
      { page: 0, take: 2 },
    );
    const page1 = await service.findProposalsForRequest(
      authUser(learnerId, UserRole.LEARNER),
      request.id,
      { page: 1, take: 2 },
    );

    expect(page0.totalCount).toBe(3);
    expect(page0.paginatedResult).toHaveLength(2);
    expect(page1.paginatedResult).toHaveLength(1);

    await prisma.user.deleteMany({
      where: { id: { in: extraTutors.map((t) => t.id) } },
    });
  });
});
