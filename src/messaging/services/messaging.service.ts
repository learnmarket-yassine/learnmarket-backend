import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MessageStatus,
  Prisma,
  ProposalStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingGateway } from '../gateways/messaging.gateway';

const PARTICIPANT_SELECT = {
  id: true,
  firstname: true,
  lastname: true,
  avatar: true,
} as const;

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MessagingGateway))
    private readonly messagingGateway: MessagingGateway,
  ) {}

  async findOrCreateConversation(userId: string, counterpartId: string) {
    const [userA, userB] = await this.prisma.user.findMany({
      where: { id: { in: [userId, counterpartId] } },
    });
    if (!userA || !userB) throw new NotFoundException('User not found');

    const tutor = userA.role === UserRole.TUTOR ? userA : userB;
    const learner = userA.role === UserRole.LEARNER ? userA : userB;
    if (tutor.role !== UserRole.TUTOR || learner.role !== UserRole.LEARNER) {
      throw new BadRequestException(
        'Conversations are only between a tutor and a learner',
      );
    }

    const existing = await this.prisma.conversation.findUnique({
      where: {
        tutorId_learnerId: { tutorId: tutor.id, learnerId: learner.id },
      },
    });
    if (existing) return existing;

    const hasRelationship = await this.prisma.proposal.findFirst({
      where: {
        tutorId: tutor.id,
        learnRequest: { learnerId: learner.id },
        status: { in: [ProposalStatus.PENDING, ProposalStatus.ACCEPTED] },
      },
    });
    if (!hasRelationship) {
      throw new ForbiddenException(
        'A conversation requires an active or pending proposal between these users',
      );
    }

    return this.prisma.conversation.create({
      data: { tutorId: tutor.id, learnerId: learner.id },
    });
  }

  async assertParticipant(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        OR: [{ tutorId: userId }, { learnerId: userId }],
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async sendMessage(senderId: string, conversationId: string, content: string) {
    const conversation = await this.assertParticipant(senderId, conversationId);
    if (!conversation.isActive) {
      throw new ConflictException(
        'This conversation is no longer active -- there is no pending or accepted proposal between you',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { conversationId, senderId, content },
        include: { sender: { select: PARTICIPANT_SELECT } },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      return message;
    });
  }

  async markRead(userId: string, conversationId: string) {
    await this.assertParticipant(userId, conversationId);
    return this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        status: { not: MessageStatus.READ },
      },
      data: { status: MessageStatus.READ, readAt: new Date() },
    });
  }

  async listConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ tutorId: userId }, { learnerId: userId }] },
      orderBy: { updatedAt: 'desc' },
      include: {
        tutor: { select: PARTICIPANT_SELECT },
        learner: { select: PARTICIPANT_SELECT },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const unreadCounts = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: conversations.map((c) => c.id) },
        senderId: { not: userId },
        status: { not: MessageStatus.READ },
      },
      _count: true,
    });
    const unreadMap = new Map(
      unreadCounts.map((u) => [u.conversationId, u._count]),
    );
    return conversations.map((c) => ({
      ...c,
      unreadCount: unreadMap.get(c.id) ?? 0,
    }));
  }

  async getMessages(
    userId: string,
    conversationId: string,
    page: number,
    take: number,
  ) {
    await this.assertParticipant(userId, conversationId);
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        skip: page * take,
        take,
        include: { sender: { select: PARTICIPANT_SELECT } },
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);

    return { paginatedResult: items, totalCount };
  }
  async recomputeConversationActiveState(
    tx: Prisma.TransactionClient,
    tutorId: string,
    learnerId: string,
  ): Promise<void> {
    const conversation = await tx.conversation.findUnique({
      where: { tutorId_learnerId: { tutorId, learnerId } },
    });
    if (!conversation) return;

    const hasActiveRelationship = await tx.proposal.findFirst({
      where: {
        tutorId,
        learnRequest: { learnerId },
        status: { in: [ProposalStatus.PENDING, ProposalStatus.ACCEPTED] },
      },
    });
    const shouldBeActive = !!hasActiveRelationship;

    if (conversation.isActive !== shouldBeActive) {
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { isActive: shouldBeActive },
      });
      this.messagingGateway.emitConversationStatusChanged(
        conversation.id,
        tutorId,
        learnerId,
        shouldBeActive,
      );
    }
  }
}
