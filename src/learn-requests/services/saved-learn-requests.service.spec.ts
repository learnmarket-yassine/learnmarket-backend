import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LearnRequestsService } from './learn-requests.service';
import { SavedLearnRequestsService } from './saved-learn-requests.service';

describe('SavedLearnRequestsService', () => {
  let service: SavedLearnRequestsService;
  let prisma: {
    learnRequest: { findUnique: jest.Mock };
    savedLearnRequest: {
      findUnique: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let learnRequests: { attachDerivedFields: jest.Mock };

  const tutorId = 'tutor-1';
  const learnRequestId = 'request-1';

  beforeEach(async () => {
    prisma = {
      learnRequest: { findUnique: jest.fn() },
      savedLearnRequest: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((queries: unknown[]) => Promise.all(queries)),
    };
    learnRequests = { attachDerivedFields: jest.fn((items) => items) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SavedLearnRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LearnRequestsService, useValue: learnRequests },
      ],
    }).compile();

    service = moduleRef.get(SavedLearnRequestsService);
  });

  describe('save', () => {
    it('throws NotFoundException when the learn request does not exist', async () => {
      prisma.learnRequest.findUnique.mockResolvedValue(null);

      await expect(service.save(tutorId, learnRequestId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.savedLearnRequest.create).not.toHaveBeenCalled();
    });

    it('throws a clean ConflictException on a duplicate save, not a raw constraint error', async () => {
      prisma.learnRequest.findUnique.mockResolvedValue({ id: learnRequestId });
      prisma.savedLearnRequest.findUnique.mockResolvedValue({
        id: 'already-saved',
      });

      await expect(service.save(tutorId, learnRequestId)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.savedLearnRequest.create).not.toHaveBeenCalled();
    });

    it('creates the saved row when the request exists and is not already saved', async () => {
      prisma.learnRequest.findUnique.mockResolvedValue({ id: learnRequestId });
      prisma.savedLearnRequest.findUnique.mockResolvedValue(null);

      await service.save(tutorId, learnRequestId);

      expect(prisma.savedLearnRequest.create).toHaveBeenCalledWith({
        data: { tutorId, learnRequestId },
      });
    });
  });

  describe('unsave', () => {
    it('throws NotFoundException when nothing was deleted', async () => {
      prisma.savedLearnRequest.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unsave(tutorId, learnRequestId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('succeeds silently when a row was deleted', async () => {
      prisma.savedLearnRequest.deleteMany.mockResolvedValue({ count: 1 });

      await expect(
        service.unsave(tutorId, learnRequestId),
      ).resolves.toBeUndefined();
    });
  });

  describe('listSaved', () => {
    it('maps saved rows to their learn requests and runs them through attachDerivedFields', async () => {
      const learnRequestA = { id: 'a' };
      const learnRequestB = { id: 'b' };
      prisma.savedLearnRequest.findMany.mockResolvedValue([
        { learnRequest: learnRequestA },
        { learnRequest: learnRequestB },
      ]);
      prisma.savedLearnRequest.count.mockResolvedValue(2);

      const result = await service.listSaved(
        { id: tutorId, role: 'TUTOR', email: 't@test.local' },
        0,
        10,
      );

      expect(learnRequests.attachDerivedFields).toHaveBeenCalledWith([
        learnRequestA,
        learnRequestB,
      ]);
      expect(result).toEqual({
        paginatedResult: [learnRequestA, learnRequestB],
        totalCount: 2,
      });
    });
  });
});
