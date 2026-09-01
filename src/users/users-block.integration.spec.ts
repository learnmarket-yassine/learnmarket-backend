import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LearnRequestType, PrismaClient } from '@prisma/client';
import { UsersService } from './users.service';
import { AdminUsersController } from './admin-users.controller';
import { LearnRequestsService } from '../learn-requests/services/learn-requests.service';
import { ProposalsService } from '../proposals/services/proposals.service';

describe('Blocked-account restrictions (integration, real DB)', () => {
  const prisma = new PrismaClient();
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };

  const users = new UsersService(prisma as never, {} as never);
  const adminUsers = new AdminUsersController(users, notifications as never);
  const learnRequests = new LearnRequestsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const proposals = new ProposalsService(
    prisma as never,
    {} as never,
    {} as never,
    notifications as never,
    {} as never,
  );

  let tutorId: string;
  let learnerId: string;
  let categoryId: string;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    notifications.create.mockClear();
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
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [tutorId, learnerId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  describe('UsersService.blockUser / unblockUser', () => {
    it('blocks an active user', async () => {
      const result = await users.blockUser(learnerId);

      expect(result.isBlocked).toBe(true);
    });

    it('rejects blocking a user who is already blocked', async () => {
      await users.blockUser(learnerId);

      await expect(users.blockUser(learnerId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws NotFoundException when blocking a user that does not exist', async () => {
      await expect(
        users.blockUser('00000000-0000-0000-0000-000000000000'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('unblocks a blocked user', async () => {
      await users.blockUser(learnerId);

      const result = await users.unblockUser(learnerId);

      expect(result.isBlocked).toBe(false);
    });

    it('rejects unblocking a user who is not blocked', async () => {
      await expect(users.unblockUser(learnerId)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('AdminUsersController.block / unblock', () => {
    it('blocks the user and notifies them', async () => {
      const result = await adminUsers.block(learnerId);

      expect(result.isBlocked).toBe(true);
      expect(notifications.create).toHaveBeenCalledWith(
        learnerId,
        'ACCOUNT_STATUS_UPDATED',
        expect.any(String),
        expect.any(String),
      );
    });

    it('unblocks the user and notifies them', async () => {
      await adminUsers.block(learnerId);
      notifications.create.mockClear();

      const result = await adminUsers.unblock(learnerId);

      expect(result.isBlocked).toBe(false);
      expect(notifications.create).toHaveBeenCalledWith(
        learnerId,
        'ACCOUNT_STATUS_UPDATED',
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('LearnRequestsService.createDraft', () => {
    it('rejects a blocked learner', async () => {
      await users.blockUser(learnerId);

      await expect(
        learnRequests.createDraft(learnerId, {
          type: LearnRequestType.ONE_TIME,
          title: 'Some request',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows the learner again once unblocked', async () => {
      await users.blockUser(learnerId);
      await users.unblockUser(learnerId);

      await expect(
        learnRequests.createDraft(learnerId, {
          type: LearnRequestType.ONE_TIME,
          title: 'Some request',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('ProposalsService.create', () => {
    it('rejects a blocked tutor before the verification check', async () => {
      await users.blockUser(tutorId);

      await expect(
        proposals.create(tutorId, '00000000-0000-0000-0000-000000000000', {
          sessionDurationMinutes: 60,
          totalPrice: 50,
          sessionPlans: [{ title: 'Session 1' }],
        }),
      ).rejects.toThrow('Your account has been blocked');
    });

    it('falls through to the verification check once unblocked', async () => {
      await users.blockUser(tutorId);
      await users.unblockUser(tutorId);

      // No TutorProfile exists at all for this tutor, so once the block
      // check passes, the pre-existing verification gate should be the one
      // that rejects the call.
      await expect(
        proposals.create(tutorId, '00000000-0000-0000-0000-000000000000', {
          sessionDurationMinutes: 60,
          totalPrice: 50,
          sessionPlans: [{ title: 'Session 1' }],
        }),
      ).rejects.toThrow('Complete verification before creating proposals');
    });
  });
});
