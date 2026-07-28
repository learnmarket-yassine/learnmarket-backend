import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ShortlistedProposalsService } from './shortlisted-proposals.service';

describe('ShortlistedProposalsService', () => {
  let service: ShortlistedProposalsService;
  let prisma: {
    proposal: { findFirst: jest.Mock };
    shortlistedProposal: {
      findUnique: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const learnerId = 'learner-1';
  const proposalId = 'proposal-1';

  beforeEach(async () => {
    prisma = {
      proposal: { findFirst: jest.fn() },
      shortlistedProposal: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ShortlistedProposalsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(ShortlistedProposalsService);
  });

  describe('shortlist', () => {
    it('throws NotFoundException when the proposal does not belong to a request this learner owns (covers both "does not exist" and "not yours")', async () => {
      prisma.proposal.findFirst.mockResolvedValue(null);

      await expect(service.shortlist(learnerId, proposalId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.proposal.findFirst).toHaveBeenCalledWith({
        where: { id: proposalId, learnRequest: { learnerId } },
      });
      expect(prisma.shortlistedProposal.create).not.toHaveBeenCalled();
    });

    it('throws a clean ConflictException on a duplicate shortlist, not a raw constraint error', async () => {
      prisma.proposal.findFirst.mockResolvedValue({ id: proposalId });
      prisma.shortlistedProposal.findUnique.mockResolvedValue({
        id: 'already-shortlisted',
      });

      await expect(service.shortlist(learnerId, proposalId)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.shortlistedProposal.create).not.toHaveBeenCalled();
    });

    it('creates the shortlisted row when the proposal is owned and not already shortlisted', async () => {
      prisma.proposal.findFirst.mockResolvedValue({ id: proposalId });
      prisma.shortlistedProposal.findUnique.mockResolvedValue(null);

      await service.shortlist(learnerId, proposalId);

      expect(prisma.shortlistedProposal.create).toHaveBeenCalledWith({
        data: { learnerId, proposalId },
      });
    });
  });

  describe('unshortlist', () => {
    it('throws NotFoundException when nothing was deleted', async () => {
      prisma.shortlistedProposal.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.unshortlist(learnerId, proposalId),
      ).rejects.toThrow(NotFoundException);
    });

    it('succeeds silently when a row was deleted', async () => {
      prisma.shortlistedProposal.deleteMany.mockResolvedValue({ count: 1 });

      await expect(
        service.unshortlist(learnerId, proposalId),
      ).resolves.toBeUndefined();
    });
  });
});
