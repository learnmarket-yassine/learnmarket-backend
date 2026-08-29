import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DisputeOutcome,
  LearnRequest,
  LearnRequestType,
  NotificationType,
  PaymentStatus,
  Prisma,
  Proposal,
  Session,
  SessionStatus,
} from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DailyService } from './daily.service';
import {
  PayoutsService,
  PayoutTrigger,
} from '../../payments/services/payouts.service';
import { PaymentsService } from '../../payments/services/payments.service';
import { ListSessionDisputesQueryDto } from '../dto/list-session-disputes-query.dto';
import { AuthUser } from '../../common/decorators/current-user.decorator';

const JOIN_WINDOW_BEFORE_MS = 15 * 60_000;
const JOIN_GRACE_AFTER_MS = 30 * 60_000;

const SESSION_WITH_PARTICIPANTS = {
  proposal: {
    include: {
      learnRequest: {
        select: {
          learner: {
            select: { firstname: true, lastname: true, avatar: true, id: true },
          },
        },
      },
      tutor: {
        select: { firstname: true, lastname: true, avatar: true, id: true },
      },
      payment: { select: { currency: true } },
    },
  },
  booking: true,
  dispute: true,
} as const;

const DISPUTE_PARTICIPANT_SELECT = {
  id: true,
  firstname: true,
  lastname: true,
  avatar: true,
} as const;

const DISPUTE_QUEUE_INCLUDE = {
  dispute: true,
  booking: true,
  proposal: {
    select: {
      totalPrice: true,
      payoutMethod: true,
      payment: { select: { currency: true } },
      tutor: { select: DISPUTE_PARTICIPANT_SELECT },
      learnRequest: {
        select: {
          title: true,
          learner: { select: DISPUTE_PARTICIPANT_SELECT },
        },
      },
    },
  },
} as const;

export type SessionWithParticipants = Awaited<
  ReturnType<SessionsService['assertParticipant']>
>;

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dailyService: DailyService,
    private readonly payoutsService: PayoutsService,
    private readonly paymentsService: PaymentsService,
    private readonly notifications: NotificationsService,
  ) {}

  async assertParticipant(
    userId: string,
    sessionId: string,
    currentUser?: AuthUser,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: SESSION_WITH_PARTICIPANTS,
    });
    if (!session) throw new NotFoundException('Session not found');

    const isTutor = session.proposal.tutorId === userId;
    const isLearner = session.proposal.learnRequest.learner.id === userId;
    if (
      !isTutor &&
      !isLearner &&
      (!currentUser || currentUser.role !== 'ADMIN')
    ) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  isTutor(session: SessionWithParticipants, userId: string): boolean {
    return session.proposal.tutorId === userId;
  }

  async getSessionContext(
    userId: string,
    sessionId: string,
    currentUser: AuthUser,
  ) {
    const session = await this.assertParticipant(
      userId,
      sessionId,
      currentUser,
    );
    const disputedAmount = session.dispute
      ? await this.previewDisputedAmount(session)
      : null;
    return {
      id: session.id,
      title: session.title,
      objective: session.objective,
      status: session.status,
      isTutor: this.isTutor(session, userId),
      tutor: {
        firstname: session.proposal.tutor.firstname,
        lastname: session.proposal.tutor.lastname,
        id: session.proposal.tutor.id,
        avatar: session.proposal.tutor.avatar,
      },
      learner: {
        firstname: session.proposal.learnRequest.learner.firstname,
        lastname: session.proposal.learnRequest.learner.lastname,
        id: session.proposal.learnRequest.learner.id,
        avatar: session.proposal.learnRequest.learner.avatar,
      },
      tutorJoinedAt: session.tutorJoinedAt,
      learnerJoinedAt: session.learnerJoinedAt,
      summary: session.summary,
      summarySubmittedAt: session.summarySubmittedAt,
      learnerConfirmedAt: session.learnerConfirmedAt,
      dispute: session.dispute
        ? {
            reason: session.dispute.reason,
            raisedAt: session.dispute.raisedAt,
            outcome: session.dispute.outcome,
            reviewNote: session.dispute.reviewNote,
          }
        : null,
      disputedAmount,
      booking: session.booking
        ? {
            id: session.booking.id,
            status: session.booking.status,
            startTime: session.booking.startTime,
            endTime: session.booking.endTime,
          }
        : null,
    };
  }

  async provisionMeeting(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { booking: true },
    });
    if (!session || session.dailyRoomUrl || !session.booking) return;

    try {
      const room = await this.dailyService.createRoom(
        session.id,
        new Date(session.booking.endTime.getTime() + JOIN_GRACE_AFTER_MS),
      );
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          dailyRoomName: room.name,
          dailyRoomUrl: room.url,
        },
      });
    } catch (err) {
      this.logger.error('Daily meeting provisioning failed', err);
    }
  }

  async updateMeetingTime(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { booking: true },
    });
    if (!session?.dailyRoomName || !session.booking) return;

    try {
      await this.dailyService.updateRoomExpiry(
        session.dailyRoomName,
        new Date(session.booking.endTime.getTime() + JOIN_GRACE_AFTER_MS),
      );
    } catch (err) {
      this.logger.error('Daily meeting time update failed', err);
    }
  }

  async retryMeeting(userId: string, sessionId: string) {
    const session = await this.assertParticipant(userId, sessionId);
    if (!this.isTutor(session, userId)) {
      throw new NotFoundException('Session not found');
    }
    if (session.dailyRoomUrl) {
      throw new ConflictException(
        'A meeting has already been provisioned for this session',
      );
    }
    await this.provisionMeeting(sessionId);
    return this.getMeetingDetails(userId, sessionId);
  }

  async getMeetingDetails(
    userId: string,
    sessionId: string,
    currentUser?: AuthUser,
  ) {
    const session = await this.assertParticipant(
      userId,
      sessionId,
      currentUser,
    );

    if (!session.dailyRoomUrl || !session.dailyRoomName) {
      return { status: 'not_provisioned' as const, canJoinYet: false };
    }

    if (session.booking && this.hasSessionEnded(session.booking)) {
      return { status: 'not_provisioned' as const, canJoinYet: false };
    }

    const isTutor = this.isTutor(session, userId);
    const canJoinYet = this.computeCanJoinYet(session.booking);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { firstname: true, lastname: true },
    });

    const token = await this.dailyService.createMeetingToken({
      roomName: session.dailyRoomName,
      userId,
      userName: `${user.firstname} ${user.lastname}`,
      isOwner: isTutor,
      expiresAt: session.booking
        ? new Date(session.booking.endTime.getTime() + JOIN_GRACE_AFTER_MS)
        : new Date(Date.now() + JOIN_GRACE_AFTER_MS),
    });

    return {
      status: 'provisioned' as const,
      canJoinYet,
      joinUrl: `${session.dailyRoomUrl}?t=${token}`,
    };
  }

  private computeCanJoinYet(
    booking: { startTime: Date; endTime: Date } | null,
  ): boolean {
    if (!booking) return false;
    const now = Date.now();
    return (
      now >= booking.startTime.getTime() - JOIN_WINDOW_BEFORE_MS &&
      now <= booking.endTime.getTime() + JOIN_GRACE_AFTER_MS
    );
  }

  private hasSessionEnded(booking: { endTime: Date }): boolean {
    return Date.now() > booking.endTime.getTime() + JOIN_GRACE_AFTER_MS;
  }

  async recordVerifiedJoin(
    dailyRoomName: string,
    dailyUserId: string,
  ): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { dailyRoomName },
      include: SESSION_WITH_PARTICIPANTS,
    });
    if (!session) return;

    const isTutor = session.proposal.tutorId === dailyUserId;
    const isLearner = session.proposal.learnRequest.learner.id === dailyUserId;
    if (!isTutor && !isLearner) return;

    const now = new Date();
    if (isTutor) {
      await this.prisma.session.updateMany({
        where: { id: session.id, tutorJoinedAt: null },
        data: { tutorJoinedAt: now },
      });
    } else {
      await this.prisma.session.updateMany({
        where: { id: session.id, learnerJoinedAt: null },
        data: { learnerJoinedAt: now },
      });
    }
  }

  async submitSessionSummary(
    userId: string,
    sessionId: string,
    summary: string,
  ) {
    const session = await this.assertParticipant(userId, sessionId);
    if (!this.isTutor(session, userId)) {
      throw new NotFoundException('Session not found');
    }

    if (
      session.status !== SessionStatus.PENDING_REVIEW &&
      session.status !== SessionStatus.DISPUTED
    ) {
      throw new ConflictException('This session is not awaiting review');
    }
    if (session.summarySubmittedAt) {
      throw new ConflictException(
        'A summary has already been submitted for this session',
      );
    }

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: { summary, summarySubmittedAt: new Date() },
    });
    await this.tryCompleteIfBothBranchesReady(sessionId);
    return updated;
  }

  async confirmSession(userId: string, sessionId: string) {
    const session = await this.assertParticipant(userId, sessionId);
    if (this.isTutor(session, userId)) {
      throw new NotFoundException('Session not found');
    }
    if (session.status !== SessionStatus.PENDING_REVIEW) {
      throw new ConflictException('This session is not awaiting review');
    }
    if (session.learnerConfirmedAt || session.dispute) {
      throw new ConflictException(
        'You have already responded for this session',
      );
    }

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: { learnerConfirmedAt: new Date() },
    });
    await this.tryCompleteIfBothBranchesReady(sessionId);
    return updated;
  }

  async disputeSession(userId: string, sessionId: string, reason: string) {
    const session = await this.assertParticipant(userId, sessionId);
    if (this.isTutor(session, userId)) {
      throw new NotFoundException('Session not found');
    }
    if (session.status !== SessionStatus.PENDING_REVIEW) {
      throw new ConflictException('This session is not awaiting review');
    }
    if (session.learnerConfirmedAt || session.dispute) {
      throw new ConflictException(
        'You have already responded for this session',
      );
    }
    const [, disputed] = await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: sessionId },
        data: { status: SessionStatus.DISPUTED },
      }),
      this.prisma.sessionDispute.create({
        data: { sessionId, reason },
      }),
    ]);

    await this.notifications.create(
      session.proposal.tutorId,
      NotificationType.SESSION_REPORTED,
      'Session reported',
      'A learner reported an issue with one of your sessions.',
      { sessionId },
    );

    return disputed;
  }

  async listDisputedSessions(query: ListSessionDisputesQueryDto) {
    const { page, take } = query;
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where: { status: SessionStatus.DISPUTED },
        orderBy: { updatedAt: 'asc' },
        skip: page * take,
        take,
        include: DISPUTE_QUEUE_INCLUDE,
      }),
      this.prisma.session.count({ where: { status: SessionStatus.DISPUTED } }),
    ]);
    const paginatedResult = await Promise.all(
      items.map((item) => this.attachDisputedAmount(item)),
    );
    return { paginatedResult, totalCount };
  }

  async getDisputeDetail(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: DISPUTE_QUEUE_INCLUDE,
    });
    if (!session?.dispute) throw new NotFoundException('Session not found');
    return this.attachDisputedAmount(session);
  }

  private async attachDisputedAmount<
    T extends {
      sessionNumber: number;
      proposalId: string;
      proposal: {
        totalPrice: Prisma.Decimal;
        payoutMethod: string;
        payment: { currency: string } | null;
      };
    },
  >(session: T) {
    const disputedAmount = await this.previewDisputedAmount(session);
    return { ...session, disputedAmount };
  }

  private async previewDisputedAmount(session: {
    sessionNumber: number;
    proposalId: string;
    proposal: {
      totalPrice: Prisma.Decimal;
      payment: { currency: string } | null;
    };
  }) {
    const totalSessions = await this.prisma.session.count({
      where: { proposalId: session.proposalId },
    });
    return this.payoutsService.previewSessionAmount(
      session,
      session.proposal,
      totalSessions,
    );
  }
  async resolveDispute(
    sessionId: string,
    outcome: DisputeOutcome,
    note: string,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { dispute: true, proposal: { include: { learnRequest: true } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (!session.dispute) {
      throw new ConflictException('This session was never reported');
    }
    if (session.status !== SessionStatus.DISPUTED) {
      throw new ConflictException('This dispute has already been resolved');
    }

    if (outcome === DisputeOutcome.RELEASED) {
      const trigger = await this.prisma.$transaction(async (tx) => {
        const result = await this.completeSessionCascade(tx, sessionId);
        await tx.sessionDispute.update({
          where: { sessionId },
          data: { outcome, reviewedAt: new Date(), reviewNote: note },
        });
        return result;
      });
      if (trigger?.shouldRelease) {
        await this.payoutsService.releasePayout(trigger.payoutId);
      }
    } else {
      await this.prisma.$transaction(async (tx) => {
        await tx.session.update({
          where: { id: sessionId },
          data: { status: SessionStatus.COMPLETED },
        });
        await tx.booking.updateMany({
          where: { sessionId, status: 'CONFIRMED' },
          data: { status: 'COMPLETED' },
        });
        await tx.sessionDispute.update({
          where: { sessionId },
          data: { outcome, reviewedAt: new Date(), reviewNote: note },
        });
        await this.advanceCourse(tx, session, session.proposal);
      });
      await this.paymentsService.refundSession(sessionId, note);
    }

    const learnerId = session.proposal.learnRequest.learnerId;
    const learnerMessage =
      outcome === DisputeOutcome.RELEASED
        ? 'The reported session was reviewed -- payment was released to the tutor.'
        : 'The reported session was reviewed -- you have been refunded.';
    const tutorMessage =
      outcome === DisputeOutcome.RELEASED
        ? 'The reported session was reviewed -- your payment was released.'
        : 'The reported session was reviewed -- the learner was refunded.';
    await this.notifications.create(
      learnerId,
      NotificationType.DISPUTE_RESOLVED,
      'Dispute resolved',
      learnerMessage,
      { sessionId },
    );
    await this.notifications.create(
      session.proposal.tutorId,
      NotificationType.DISPUTE_RESOLVED,
      'Dispute resolved',
      tutorMessage,
      { sessionId },
    );

    return this.prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: { dispute: true },
    });
  }

  async tryCompleteIfBothBranchesReady(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.status !== SessionStatus.PENDING_REVIEW) return;
    if (!session.summarySubmittedAt || !session.learnerConfirmedAt) return; // still waiting on one branch

    const trigger = await this.prisma.$transaction((tx) =>
      this.completeSessionCascade(tx, sessionId),
    );
    if (trigger?.shouldRelease) {
      await this.payoutsService.releasePayout(trigger.payoutId);
    }
  }

  async completeSessionCascade(
    tx: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<PayoutTrigger | null> {
    const claimed = await tx.session.updateMany({
      where: { id: sessionId, status: { not: SessionStatus.COMPLETED } },
      data: { status: SessionStatus.COMPLETED },
    });
    if (claimed.count === 0) return null;

    await tx.booking.updateMany({
      where: { sessionId, status: 'CONFIRMED' },
      data: { status: 'COMPLETED' },
    });

    const completedSession = await tx.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: { proposal: { include: { learnRequest: true, payment: true } } },
    });
    const { proposal } = completedSession;

    await this.advanceCourse(tx, completedSession, proposal);
    if (
      !proposal.payment ||
      (proposal.payment.status !== PaymentStatus.SUCCEEDED &&
        proposal.payment.status !== PaymentStatus.PARTIALLY_REFUNDED)
    ) {
      return null;
    }

    return this.payoutsService.recordPayoutForCompletedSession(
      tx,
      completedSession,
      proposal,
      proposal.payment,
    );
  }
  private async advanceCourse(
    tx: Prisma.TransactionClient,
    session: Session,
    proposal: Proposal & { learnRequest: LearnRequest },
  ): Promise<void> {
    const nextSession = await tx.session.findFirst({
      where: {
        proposalId: proposal.id,
        sessionNumber: { gt: session.sessionNumber },
      },
      orderBy: { sessionNumber: 'asc' },
    });

    if (!nextSession) {
      await tx.learnRequest.update({
        where: { id: proposal.learnRequest.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } else if (
      proposal.learnRequest.type === LearnRequestType.COURSE &&
      nextSession.status === SessionStatus.LOCKED
    ) {
      await tx.session.update({
        where: { id: nextSession.id },
        data: { status: SessionStatus.PENDING_SCHEDULE },
      });
    }
  }
}
