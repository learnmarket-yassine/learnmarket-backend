import { Test, TestingModule } from '@nestjs/testing';
import { LearnRequestStatus, LearnRequestType, ProposalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProposalsService } from './proposals.service';
import { ProposalGroup } from '../dto/get-my-proposals-query.dto';

describe('ProposalsService.findMyProposals (integration, real DB)', () => {
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
          firstname: 'O',
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
        type: LearnRequestType.ONE_TIME,
        title: 'Some request',
        status: LearnRequestStatus.OPEN,
        categoryId,
      },
    });
    learnRequestId = learnRequest.id;
  });

  afterEach(async () => {
    await prisma.proposal.deleteMany({ where: { learnRequestId } });
    await prisma.learnRequest.deleteMany({ where: { id: learnRequestId } });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, otherTutorId, learnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  async function createProposal(ownerId: string, status: ProposalStatus) {
    return prisma.proposal.create({
      data: {
        learnRequestId,
        tutorId: ownerId,
        sessionDurationMinutes: 60,
        totalPrice: 50,
        status,
      },
    });
  }

  it('ACTIVE group returns only this tutor own PENDING/ACCEPTED proposals', async () => {
    const pending = await createProposal(tutorId, ProposalStatus.PENDING);
    const accepted = await createProposal(tutorId, ProposalStatus.ACCEPTED);
    await createProposal(tutorId, ProposalStatus.DECLINED);
    await createProposal(otherTutorId, ProposalStatus.PENDING);

    const result = await proposals.findMyProposals(tutorId, {
      group: ProposalGroup.ACTIVE,
      page: 0,
      take: 10,
    });

    expect(result.totalCount).toBe(2);
    const ids = result.paginatedResult.map((p) => p.id);
    expect(ids.sort()).toEqual([pending.id, accepted.id].sort());
  });

  it('ARCHIVED group returns only DECLINED/WITHDRAWN', async () => {
    await createProposal(tutorId, ProposalStatus.PENDING);
    const declined = await createProposal(tutorId, ProposalStatus.DECLINED);
    const withdrawn = await createProposal(tutorId, ProposalStatus.WITHDRAWN);

    const result = await proposals.findMyProposals(tutorId, {
      group: ProposalGroup.ARCHIVED,
      page: 0,
      take: 10,
    });

    expect(result.totalCount).toBe(2);
    const ids = result.paginatedResult.map((p) => p.id);
    expect(ids.sort()).toEqual([declined.id, withdrawn.id].sort());
  });

  it("never returns another tutor's proposals, even without a group filter", async () => {
    await createProposal(otherTutorId, ProposalStatus.PENDING);
    await createProposal(otherTutorId, ProposalStatus.ACCEPTED);
    const mine = await createProposal(tutorId, ProposalStatus.PENDING);

    const result = await proposals.findMyProposals(tutorId, { page: 0, take: 10 });

    expect(result.totalCount).toBe(1);
    expect(result.paginatedResult[0].id).toBe(mine.id);
  });
});
