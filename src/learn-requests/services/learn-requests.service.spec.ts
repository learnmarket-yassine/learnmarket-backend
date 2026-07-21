import {
  LearnRequestStatus,
  LearnRequestType,
  ProficiencyLevel,
  ProposalStatus,
  SessionStatus,
  UserRole,
} from '@prisma/client';
import { LearnRequestsService } from './learn-requests.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { GetLearnRequestsQueryDto } from '../dto/list-learn-requests-query.dto';

type FindManyArgs = {
  where: { AND: [Record<string, unknown>, Record<string, unknown>] };
  skip: number;
  take: number;
};

function learnRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lr-1',
    learnerId: 'learner-1',
    status: LearnRequestStatus.OPEN,
    type: LearnRequestType.ONE_TIME,
    title: 'Learn French',
    categoryId: 'cat-1',
    ...overrides,
  };
}

function query(
  overrides: Partial<GetLearnRequestsQueryDto> = {},
): GetLearnRequestsQueryDto {
  return { page: 0, take: 10, ...overrides };
}

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'user@test.com',
    role: UserRole.LEARNER,
    ...overrides,
  };
}

describe('LearnRequestsService.findMany', () => {
  let prisma: {
    learnRequest: { findMany: jest.Mock; count: jest.Mock };
    proposal: { findMany: jest.Mock };
    session: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: LearnRequestsService;

  function lastFindManyArgs(): FindManyArgs {
    const calls = prisma.learnRequest.findMany.mock.calls as [FindManyArgs][];
    return calls[calls.length - 1][0];
  }

  beforeEach(() => {
    prisma = {
      learnRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      proposal: { findMany: jest.fn().mockResolvedValue([]) },
      session: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    service = new LearnRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('never applies a TUTOR-supplied status filter, so a TUTOR asking for status=DRAFT still only receives OPEN results', async () => {
    prisma.learnRequest.findMany.mockResolvedValue([
      learnRequest({ id: 'lr-open', status: LearnRequestStatus.OPEN }),
    ]);

    await service.findMany(
      user({ role: UserRole.TUTOR }),
      query({ status: [LearnRequestStatus.DRAFT] }),
    );

    const { where } = lastFindManyArgs();
    expect(where.AND[0]).toEqual({ status: LearnRequestStatus.OPEN });
    expect(where.AND[1]).not.toHaveProperty('status');
  });

  it('never applies a TUTOR-supplied status filter even when combined with level/budget filters, so a TUTOR still only receives OPEN results', async () => {
    prisma.learnRequest.findMany.mockResolvedValue([
      learnRequest({ id: 'lr-open', status: LearnRequestStatus.OPEN }),
    ]);

    await service.findMany(
      user({ role: UserRole.TUTOR }),
      query({
        status: [LearnRequestStatus.DRAFT],
        level: [ProficiencyLevel.BEGINNER],
        budgetMin: 20,
        budgetMax: 40,
      }),
    );

    const { where } = lastFindManyArgs();
    expect(where.AND[0]).toEqual({ status: LearnRequestStatus.OPEN });
    expect(where.AND[1]).not.toHaveProperty('status');
    expect(where.AND[1]).toMatchObject({
      level: { in: [ProficiencyLevel.BEGINNER] },
      budgetMax: { gte: 20 },
      budgetMin: { lte: 40 },
    });
  });

  it('scopes a LEARNER to their own requests across every status, with no learnerId accepted from the query', async () => {
    await service.findMany(
      user({ id: 'learner-1', role: UserRole.LEARNER }),
      query(),
    );

    const { where } = lastFindManyArgs();
    expect(where.AND[0]).toEqual({ learnerId: 'learner-1' });
    // GetLearnRequestsQueryDto has no learnerId field, so there is no code path
    // through which a client-supplied learnerId could reach the narrowing where.
    expect(where.AND[1]).not.toHaveProperty('learnerId');
  });

  it('lets a LEARNER filter their own requests by any status', async () => {
    await service.findMany(
      user({ id: 'learner-1', role: UserRole.LEARNER }),
      query({ status: [LearnRequestStatus.DRAFT] }),
    );

    const { where } = lastFindManyArgs();
    expect(where.AND[1]).toMatchObject({
      status: { in: [LearnRequestStatus.DRAFT] },
    });
  });

  it('lets a LEARNER filter their own requests by more than one status at once', async () => {
    await service.findMany(
      user({ id: 'learner-1', role: UserRole.LEARNER }),
      query({ status: [LearnRequestStatus.OPEN, LearnRequestStatus.CLOSED] }),
    );

    const { where } = lastFindManyArgs();
    expect(where.AND[1]).toMatchObject({
      status: { in: [LearnRequestStatus.OPEN, LearnRequestStatus.CLOSED] },
    });
  });

  it('lets an ADMIN see everything, filterable by any combination of status/categoryId/type', async () => {
    await service.findMany(
      user({ role: UserRole.ADMIN }),
      query({
        status: [LearnRequestStatus.CLOSED],
        categoryId: 'cat-1',
        type: [LearnRequestType.COURSE],
      }),
    );

    const { where } = lastFindManyArgs();
    expect(where.AND[0]).toEqual({});
    expect(where.AND[1]).toMatchObject({
      status: { in: [LearnRequestStatus.CLOSED] },
      categoryId: 'cat-1',
      type: { in: [LearnRequestType.COURSE] },
    });
  });

  it('filters by one or more types at once', async () => {
    await service.findMany(
      user({ role: UserRole.ADMIN }),
      query({ type: [LearnRequestType.ONE_TIME, LearnRequestType.COURSE] }),
    );

    const { where } = lastFindManyArgs();
    expect(where.AND[1]).toMatchObject({
      type: { in: [LearnRequestType.ONE_TIME, LearnRequestType.COURSE] },
    });
  });

  it('filters by one or more levels at once', async () => {
    await service.findMany(
      user({ role: UserRole.ADMIN }),
      query({
        level: [ProficiencyLevel.ADVANCED, ProficiencyLevel.INTERMEDIATE],
      }),
    );

    const { where } = lastFindManyArgs();
    expect(where.AND[1]).toMatchObject({
      level: { in: [ProficiencyLevel.ADVANCED, ProficiencyLevel.INTERMEDIATE] },
    });
  });

  it('filters preferred languages by overlap: a request matches if it lists any selected language', async () => {
    await service.findMany(
      user({ role: UserRole.ADMIN }),
      query({ preferredLanguages: ['english', 'spanish'] }),
    );

    const { where } = lastFindManyArgs();
    expect(where.AND[1]).toMatchObject({
      preferredLanguages: { hasSome: ['english', 'spanish'] },
    });
  });

  it('filters by one or more requested weekly frequencies', async () => {
    await service.findMany(
      user({ role: UserRole.ADMIN }),
      query({ requestedFrequency: [2, 3] }),
    );

    const { where } = lastFindManyArgs();
    expect(where.AND[1]).toMatchObject({
      requestedFrequency: { in: [2, 3] },
    });
  });

  it('combines category, level and type filters as a logical AND, not OR', async () => {
    await service.findMany(
      user({ role: UserRole.ADMIN }),
      query({
        categoryId: 'cat-1',
        level: [ProficiencyLevel.BEGINNER],
        type: [LearnRequestType.COURSE],
      }),
    );

    const { where } = lastFindManyArgs();
    expect(where.AND[1]).toMatchObject({
      categoryId: 'cat-1',
      level: { in: [ProficiencyLevel.BEGINNER] },
      type: { in: [LearnRequestType.COURSE] },
    });
  });

  it('filters budget by overlap, not containment: a 15-50 request matches a 20-40 filter', async () => {
    await service.findMany(
      user({ role: UserRole.ADMIN }),
      query({ budgetMin: 20, budgetMax: 40 }),
    );

    const { where } = lastFindManyArgs();
    // budgetMin=20 excludes requests whose own budgetMax < 20;
    // budgetMax=40 excludes requests whose own budgetMin > 40.
    // A request posted as 15-50 satisfies both (budgetMax=50 >= 20, budgetMin=15 <= 40).
    expect(where.AND[1]).toMatchObject({
      budgetMax: { gte: 20 },
      budgetMin: { lte: 40 },
    });
  });

  it('filters by actionNeeded using a real relation-based query, not a computed field', async () => {
    await service.findMany(user(), query({ actionNeeded: true }));

    const { where } = lastFindManyArgs();
    expect(where.AND[1]).toMatchObject({
      OR: [
        {
          status: LearnRequestStatus.OPEN,
          proposals: { some: { status: ProposalStatus.PENDING } },
        },
        {
          status: LearnRequestStatus.CLOSED,
          proposals: {
            some: {
              sessions: {
                some: { status: SessionStatus.PENDING_SCHEDULE },
              },
            },
          },
        },
      ],
    });
  });

  it.each([
    ['LEARNER', UserRole.LEARNER],
    ['TUTOR', UserRole.TUTOR],
    ['ADMIN', UserRole.ADMIN],
  ])('applies page/take identically for a %s', async (_label, role) => {
    await service.findMany(user({ role }), query({ page: 3, take: 5 }));

    const call = lastFindManyArgs();
    expect(call.skip).toBe(15);
    expect(call.take).toBe(5);
  });

  it('marks actionNeeded true for an OPEN request with a pending proposal', async () => {
    prisma.learnRequest.findMany.mockResolvedValue([
      learnRequest({ id: 'lr-open', status: LearnRequestStatus.OPEN }),
    ]);
    prisma.proposal.findMany.mockResolvedValue([{ learnRequestId: 'lr-open' }]);

    const { paginatedResult } = await service.findMany(user(), query());

    const proposalCalls = prisma.proposal.findMany.mock.calls as [
      { where: { learnRequestId: { in: string[] }; status: string } },
    ][];
    const proposalCall = proposalCalls[0][0];
    expect(proposalCall.where).toMatchObject({
      learnRequestId: { in: ['lr-open'] },
      status: ProposalStatus.PENDING,
    });
    expect(paginatedResult[0].actionNeeded).toBe(true);
  });

  it('marks actionNeeded true for a CLOSED request with an unscheduled session', async () => {
    prisma.learnRequest.findMany.mockResolvedValue([
      learnRequest({ id: 'lr-closed', status: LearnRequestStatus.CLOSED }),
    ]);
    prisma.session.findMany.mockResolvedValue([
      { proposal: { learnRequestId: 'lr-closed' } },
    ]);

    const { paginatedResult } = await service.findMany(user(), query());

    const sessionCalls = prisma.session.findMany.mock.calls as [
      {
        where: {
          status: string;
          proposal: { learnRequestId: { in: string[] } };
        };
      },
    ][];
    const sessionCall = sessionCalls[0][0];
    expect(sessionCall.where).toMatchObject({
      status: SessionStatus.PENDING_SCHEDULE,
      proposal: { learnRequestId: { in: ['lr-closed'] } },
    });
    expect(paginatedResult[0].actionNeeded).toBe(true);
  });

  it('marks actionNeeded false when neither trigger condition holds', async () => {
    prisma.learnRequest.findMany.mockResolvedValue([
      learnRequest({ id: 'lr-open', status: LearnRequestStatus.OPEN }),
      learnRequest({ id: 'lr-closed', status: LearnRequestStatus.CLOSED }),
    ]);

    const { paginatedResult } = await service.findMany(user(), query());

    expect(paginatedResult.map((item) => item.actionNeeded)).toEqual([
      false,
      false,
    ]);
  });
});
