import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  LearnRequestStatus,
  LearnRequestType,
  ProposalStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProposalsService } from './proposals.service';
import { UpdateProposalDto } from '../dto/update-proposal.dto';

describe('ProposalsService.update (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let proposals: ProposalsService;

  let tutorId: string;
  let otherTutorId: string;
  let learnerId: string;
  let categoryId: string;
  let learnRequestId: string;
  let courseLearnRequestId: string;

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

    const [learnRequest, courseLearnRequest] = await Promise.all([
      prisma.learnRequest.create({
        data: {
          learnerId,
          type: LearnRequestType.ONE_TIME,
          title: 'One time request',
          status: LearnRequestStatus.OPEN,
          categoryId,
        },
      }),
      prisma.learnRequest.create({
        data: {
          learnerId,
          type: LearnRequestType.COURSE,
          title: 'Course request',
          status: LearnRequestStatus.OPEN,
          categoryId,
        },
      }),
    ]);
    learnRequestId = learnRequest.id;
    courseLearnRequestId = courseLearnRequest.id;
  });

  afterEach(async () => {
    await prisma.proposal.deleteMany({
      where: { learnRequestId: { in: [learnRequestId, courseLearnRequestId] } },
    });
    await prisma.learnRequest.deleteMany({
      where: { id: { in: [learnRequestId, courseLearnRequestId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, otherTutorId, learnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  async function createCourseProposal() {
    const proposal = await prisma.proposal.create({
      data: {
        learnRequestId: courseLearnRequestId,
        tutorId,
        sessionDurationMinutes: 60,
        totalPrice: 50,
        payoutMethod: 'PER_SESSION',
        status: ProposalStatus.PENDING,
      },
    });
    await prisma.proposalSession.createMany({
      data: [
        { proposalId: proposal.id, sessionNumber: 1, title: 'Old 1' },
        { proposalId: proposal.id, sessionNumber: 2, title: 'Old 2' },
      ],
    });
    return proposal;
  }

  it('persists sessionDurationMinutes, totalPrice and payoutMethod, not just message/sessionPlans', async () => {
    const proposal = await createCourseProposal();

    const dto: UpdateProposalDto = {
      sessionDurationMinutes: 90,
      totalPrice: 123.45,
      payoutMethod: 'PER_SESSION',
      sessionPlans: [{ title: 'New 1' }, { title: 'New 2' }],
    };

    const result = await proposals.update(tutorId, proposal.id, dto);

    expect(result.sessionDurationMinutes).toBe(90);
    // dto.totalPrice is the tutor's asking price -- the stored/returned
    // totalPrice is the learner-facing amount with the fee applied on top.
    expect(Number(result.totalPrice)).toBeCloseTo(123.45 * 1.1);
    expect(result.payoutMethod).toBe('PER_SESSION');
  });

  it("re-applies the service fee on top of the tutor's price when totalPrice is edited", async () => {
    const proposal = await createCourseProposal();

    const result = await proposals.update(tutorId, proposal.id, {
      totalPrice: 200,
      sessionPlans: [{ title: 'Session 1' }, { title: 'Session 2' }],
    });

    expect(Number(result.totalPrice)).toBeCloseTo(220);
    expect(result.tutorTotal).toBeCloseTo(200);
    expect(result.serviceFee).toBeCloseTo(20);
  });

  it('full-replaces sessionPlans -- stale rows are gone, not orphaned alongside new ones', async () => {
    const proposal = await createCourseProposal();

    await proposals.update(tutorId, proposal.id, {
      sessionPlans: [{ title: 'Brand new 1' }],
    });

    const rows = await prisma.proposalSession.findMany({
      where: { proposalId: proposal.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Brand new 1');
    expect(rows[0].sessionNumber).toBe(1);
  });

  it('forces payoutMethod to ON_COMPLETION when reduced to a single session', async () => {
    const proposal = await createCourseProposal();

    const result = await proposals.update(tutorId, proposal.id, {
      payoutMethod: 'PER_SESSION',
      sessionPlans: [{ title: 'Solo session' }],
    });

    expect(result.payoutMethod).toBe('ON_COMPLETION');
  });

  it('rejects editing a non-PENDING proposal', async () => {
    const proposal = await createCourseProposal();
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { status: ProposalStatus.ACCEPTED },
    });

    await expect(
      proposals.update(tutorId, proposal.id, { message: 'nope' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("404s when editing another tutor's proposal", async () => {
    const proposal = await createCourseProposal();

    await expect(
      proposals.update(otherTutorId, proposal.id, { message: 'nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
