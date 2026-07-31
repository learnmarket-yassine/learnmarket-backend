import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LearnRequestType,
  PaymentStatus,
  Prisma,
  SessionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DailyService } from './daily.service';
import {
  PayoutsService,
  PayoutTrigger,
} from '../../payments/services/payouts.service';
import { SessionsGateway } from '../gateways/sessions.gateway';

const JOIN_WINDOW_BEFORE_MS = 15 * 60_000;
const JOIN_GRACE_AFTER_MS = 30 * 60_000;

const SESSION_WITH_PARTICIPANTS = {
  proposal: {
    include: {
      learnRequest: true,
      tutor: { select: { firstname: true, lastname: true } },
    },
  },
  booking: true,
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
    @Inject(forwardRef(() => SessionsGateway))
    private readonly sessionsGateway: SessionsGateway,
  ) {}

  async assertParticipant(userId: string, sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: SESSION_WITH_PARTICIPANTS,
    });
    if (!session) throw new NotFoundException('Session not found');

    const isTutor = session.proposal.tutorId === userId;
    const isLearner = session.proposal.learnRequest.learnerId === userId;
    if (!isTutor && !isLearner) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  isTutor(session: SessionWithParticipants, userId: string): boolean {
    return session.proposal.tutorId === userId;
  }

  async getSessionContext(userId: string, sessionId: string) {
    const session = await this.assertParticipant(userId, sessionId);
    return {
      id: session.id,
      title: session.title,
      objective: session.objective,
      status: session.status,
      isTutor: this.isTutor(session, userId),
      tutor: {
        firstname: session.proposal.tutor.firstname,
        lastname: session.proposal.tutor.lastname,
      },
      tutorJoinedAt: session.tutorJoinedAt,
      learnerJoinedAt: session.learnerJoinedAt,
      summary: session.summary,
      summarySubmittedAt: session.summarySubmittedAt,
      learnerConfirmedAt: session.learnerConfirmedAt,
      disputeReason: session.disputeReason,
      disputedAt: session.disputedAt,
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

  async getMeetingDetails(userId: string, sessionId: string) {
    const session = await this.assertParticipant(userId, sessionId);

    if (!session.dailyRoomUrl || !session.dailyRoomName) {
      return { status: 'not_provisioned' as const, canJoinYet: false };
    }

    const isTutor = this.isTutor(session, userId);
    const canJoinYet = this.computeCanJoinYet(session.booking);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { firstname: true, lastname: true },
    });

    // is_owner is computed strictly server-side from the verified
    // participant role determined by assertParticipant above -- never taken
    // from anything the client sends. Tokens are minted fresh per call and
    // never cached/stored.
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
  /**
   * The webhook-verified counterpart to the old click-based join() -- called
   * only from DailyWebhookController after signature verification, never
   * reachable from a client request directly. Deliberately silent (no throw)
   * on an unknown room or unrecognized user_id: Daily may retry
   * participant.joined delivery, and an unrecognized room/user here is a
   * "nothing to do" case, not a delivery failure worth surfacing back to Daily.
   */
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
    const isLearner = session.proposal.learnRequest.learnerId === dailyUserId;
    if (!isTutor && !isLearner) return;

    const now = new Date();
    if (isTutor) {
      const updated = await this.prisma.session.updateMany({
        where: { id: session.id, tutorJoinedAt: null },
        data: { tutorJoinedAt: now },
      });
      if (updated.count > 0) {
        this.sessionsGateway.emitParticipantJoined(session.id, 'TUTOR');
      }
    } else {
      const updated = await this.prisma.session.updateMany({
        where: { id: session.id, learnerJoinedAt: null },
        data: { learnerJoinedAt: now },
      });
      if (updated.count > 0) {
        this.sessionsGateway.emitParticipantJoined(session.id, 'LEARNER');
      }
    }
  }

  // ---------------------------------------------------------------------
  // Parallel confirmation gate -- two independent branches (tutor summary,
  // learner confirm/dispute) must both resolve before COMPLETED fires.
  // Neither branch reads or reacts to the other's state; both call the
  // same no-op-unless-both-ready check below after writing their own field.
  // ---------------------------------------------------------------------

  async submitSessionSummary(
    userId: string,
    sessionId: string,
    summary: string,
  ) {
    const session = await this.assertParticipant(userId, sessionId);
    if (!this.isTutor(session, userId)) {
      throw new NotFoundException('Session not found');
    }
    if (session.status !== SessionStatus.PENDING_REVIEW) {
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
    if (session.learnerConfirmedAt || session.disputedAt) {
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
    if (session.learnerConfirmedAt || session.disputedAt) {
      throw new ConflictException(
        'You have already responded for this session',
      );
    }

    // Deliberately does NOT call tryCompleteIfBothBranchesReady -- a dispute
    // halts the gate permanently, regardless of the tutor branch's state.
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { disputeReason: reason, disputedAt: new Date() },
    });
  }

  /**
   * The one place both branches converge. Public (not private): the hourly
   * auto-resolve cron calls this too, after backfilling a stale branch.
   * Safe against concurrent/duplicate calls -- completeSessionCascade's own
   * guarded updateMany makes a second simultaneous caller a no-op rather
   * than a double payout.
   */
  async tryCompleteIfBothBranchesReady(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.status !== SessionStatus.PENDING_REVIEW) return;
    if (session.disputedAt) return; // permanently halted, regardless of the other branch
    if (!session.summarySubmittedAt || !session.learnerConfirmedAt) return; // still waiting on one branch

    const trigger = await this.prisma.$transaction((tx) =>
      this.completeSessionCascade(tx, sessionId),
    );
    if (trigger?.shouldRelease) {
      await this.payoutsService.releasePayout(trigger.payoutId);
    }
  }

  /**
   * The shared completion cascade -- session -> COMPLETED, next-session
   * unlock, learn-request completion, payout trigger. Used both by the
   * no-show path (BookingsCompletionCron, immediate) and by the
   * confirmation gate (tryCompleteIfBothBranchesReady, once both branches
   * resolve). This is the one place COMPLETED should ever originate from.
   */
  async completeSessionCascade(
    tx: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<PayoutTrigger | null> {
    // Guarded so a second, racing caller is a safe no-op instead of a
    // duplicate payout.
    const claimed = await tx.session.updateMany({
      where: { id: sessionId, status: { not: SessionStatus.COMPLETED } },
      data: { status: SessionStatus.COMPLETED },
    });
    if (claimed.count === 0) return null;

    const completedSession = await tx.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: { proposal: { include: { learnRequest: true, payment: true } } },
    });
    const { proposal } = completedSession;

    const nextSession = await tx.session.findFirst({
      where: {
        proposalId: proposal.id,
        sessionNumber: { gt: completedSession.sessionNumber },
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

    if (proposal.payment?.status !== PaymentStatus.SUCCEEDED) return null;

    return this.payoutsService.recordPayoutForCompletedSession(
      tx,
      completedSession,
      proposal,
      proposal.payment,
    );
  }
}
