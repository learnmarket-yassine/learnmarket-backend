import { Test, TestingModule } from '@nestjs/testing';
import { LearnRequestStatus, LearnRequestType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProposalsService } from './proposals.service';
import { CreateProposalDto } from '../dto/create-proposal.dto';

describe('ProposalsService fee breakdown (integration, real DB)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let proposals: ProposalsService;

  let tutorId: string;
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
    await prisma.user.deleteMany({ where: { id: { in: [tutorId, learnerId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  function dto(overrides: Partial<CreateProposalDto> = {}): CreateProposalDto {
    return {
      sessionDurationMinutes: 60,
      totalPrice: 100,
      sessionPlans: [{ title: 'Session 1' }],
      ...overrides,
    };
  }

  it("stores totalPrice as the tutor's price marked up by the service fee, not the raw submitted value", async () => {
    const learnRequest = await prisma.learnRequest.findUniqueOrThrow({
      where: { id: learnRequestId },
    });

    const created = await proposals.create(tutorId, learnRequest.id, dto());

    // Tutor asked for 100 -> learner-facing total is 100 * 1.1.
    expect(Number(created.totalPrice)).toBeCloseTo(110);
    expect(created.tutorTotal).toBeCloseTo(100);
    expect(created.serviceFee).toBeCloseTo(10);
  });

  it('never trusts a client-computed learner-facing amount as totalPrice', async () => {
    const learnRequest = await prisma.learnRequest.findUniqueOrThrow({
      where: { id: learnRequestId },
    });

    // Even if a caller tries to pass an already-inflated number, the
    // backend applies the fee on top of whatever arrives in totalPrice --
    // there is no way to submit a pre-marked-up value directly.
    const created = await proposals.create(
      tutorId,
      learnRequest.id,
      dto({ totalPrice: 110 }),
    );

    expect(Number(created.totalPrice)).toBeCloseTo(121);
    expect(created.tutorTotal).toBeCloseTo(110);
  });

  it('tutorTotal + serviceFee always sums back to totalPrice on every read path', async () => {
    const learnRequest = await prisma.learnRequest.findUniqueOrThrow({
      where: { id: learnRequestId },
    });
    const created = await proposals.create(tutorId, learnRequest.id, dto());

    const fetched = await proposals.findOneForViewer(
      { id: tutorId, email: 'x', role: 'TUTOR' },
      created.id,
    );

    expect(fetched.tutorTotal + fetched.serviceFee).toBeCloseTo(
      Number(fetched.totalPrice),
    );
  });
});
