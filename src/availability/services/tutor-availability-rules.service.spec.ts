import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AvailabilityGuardService } from './availability-guard.service';
import { TutorAvailabilityRulesService } from './tutor-availability-rules.service';

describe('TutorAvailabilityRulesService.applyDiff', () => {
  let service: TutorAvailabilityRulesService;
  let tx: {
    tutorAvailabilityRule: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
      update: jest.Mock;
      createMany: jest.Mock;
    };
  };
  let guard: { assertRuleChangeSafe: jest.Mock };

  const tutorId = 'tutor-1';

  beforeEach(async () => {
    tx = {
      tutorAvailabilityRule: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
        createMany: jest.fn(),
      },
    };
    guard = { assertRuleChangeSafe: jest.fn().mockResolvedValue(undefined) };

    const prisma = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TutorAvailabilityRulesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AvailabilityGuardService, useValue: guard },
      ],
    }).compile();

    service = moduleRef.get(TutorAvailabilityRulesService);
  });

  it('rejects a diff that tries to delete a rule not owned by the tutor, applying no writes', async () => {
    // Only 1 of the 2 requested ids comes back scoped to tutorId.
    tx.tutorAvailabilityRule.findMany.mockResolvedValue([{ id: 'rule-1' }]);

    await expect(
      service.applyDiff(tutorId, {
        toCreate: [],
        toUpdate: [],
        toDelete: ['rule-1', 'not-mine'],
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(tx.tutorAvailabilityRule.deleteMany).not.toHaveBeenCalled();
    expect(tx.tutorAvailabilityRule.update).not.toHaveBeenCalled();
    expect(tx.tutorAvailabilityRule.createMany).not.toHaveBeenCalled();
  });

  it('rejects a diff that tries to update a rule not owned by the tutor, stopping before later creates run', async () => {
    tx.tutorAvailabilityRule.findFirst.mockResolvedValue(null);

    await expect(
      service.applyDiff(tutorId, {
        toCreate: [{ dayOfWeek: 1, startTime: 540, endTime: 600, timezone: 'UTC' }],
        toUpdate: [{ id: 'not-mine', input: { startTime: 60, endTime: 120 } }],
        toDelete: [],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(tx.tutorAvailabilityRule.update).not.toHaveBeenCalled();
    expect(tx.tutorAvailabilityRule.createMany).not.toHaveBeenCalled();
  });

  it('applies deletes, updates, and creates together when the whole diff is owned and valid', async () => {
    tx.tutorAvailabilityRule.findMany
      // ownership check for toDelete
      .mockResolvedValueOnce([
        { id: 'del-1', tutorId, dayOfWeek: 0, startTime: 0, endTime: 60, timezone: 'UTC' },
      ])
      // final findMany returned to the caller
      .mockResolvedValueOnce([{ id: 'del-1' }, { id: 'upd-1' }]);
    tx.tutorAvailabilityRule.findFirst.mockResolvedValue({
      id: 'upd-1',
      tutorId,
      dayOfWeek: 1,
      startTime: 60,
      endTime: 120,
      timezone: 'UTC',
    });

    await service.applyDiff(tutorId, {
      toCreate: [{ dayOfWeek: 2, startTime: 60, endTime: 120, timezone: 'UTC' }],
      toUpdate: [{ id: 'upd-1', input: { startTime: 60, endTime: 90 } }],
      toDelete: ['del-1'],
    });

    expect(tx.tutorAvailabilityRule.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['del-1'] }, tutorId },
    });
    expect(tx.tutorAvailabilityRule.update).toHaveBeenCalledWith({
      where: { id: 'upd-1' },
      data: { startTime: 60, endTime: 90 },
    });
    expect(tx.tutorAvailabilityRule.createMany).toHaveBeenCalledWith({
      data: [{ dayOfWeek: 2, startTime: 60, endTime: 120, timezone: 'UTC', tutorId }],
    });
  });
});
