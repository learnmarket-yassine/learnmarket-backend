import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  LearnRequestStatus,
  LearnRequestType,
  ProposalStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProposalsService } from './proposals.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';

describe('ProposalsService.findOneForViewer / withdraw (integration, real DB)', () => {
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

  describe('findOneForViewer', () => {
    it('lets the owning tutor view their own proposal', async () => {
      const proposal = await createProposal(tutorId, ProposalStatus.PENDING);
      const viewer: AuthUser = { id: tutorId, email: 'x', role: 'TUTOR' };

      const result = await proposals.findOneForViewer(viewer, proposal.id);
      expect(result.id).toBe(proposal.id);
      expect(result.learnRequest.category?.name).toBeDefined();
    });

    it("404s a tutor trying to view another tutor's proposal, not 403", async () => {
      const proposal = await createProposal(tutorId, ProposalStatus.PENDING);
      const viewer: AuthUser = { id: otherTutorId, email: 'x', role: 'TUTOR' };

      await expect(
        proposals.findOneForViewer(viewer, proposal.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s for a non-existent proposal id', async () => {
      const viewer: AuthUser = { id: tutorId, email: 'x', role: 'TUTOR' };

      await expect(
        proposals.findOneForViewer(viewer, 'does-not-exist'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('withdraw', () => {
    it('transitions a PENDING proposal to WITHDRAWN', async () => {
      const proposal = await createProposal(tutorId, ProposalStatus.PENDING);

      const result = await proposals.withdraw(tutorId, proposal.id);
      expect(result.status).toBe(ProposalStatus.WITHDRAWN);
    });

    it("404s when withdrawing another tutor's proposal", async () => {
      const proposal = await createProposal(otherTutorId, ProposalStatus.PENDING);

      await expect(
        proposals.withdraw(tutorId, proposal.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([ProposalStatus.ACCEPTED, ProposalStatus.DECLINED, ProposalStatus.WITHDRAWN])(
      '404s when withdrawing a proposal that is already %s',
      async (status) => {
        const proposal = await createProposal(tutorId, status);

        await expect(
          proposals.withdraw(tutorId, proposal.id),
        ).rejects.toBeInstanceOf(NotFoundException);
      },
    );
  });
});
