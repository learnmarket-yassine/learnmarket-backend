import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ZoomService } from './zoom.service';
import { SessionsGateway } from '../gateways/sessions.gateway';

const MEETING_TOPIC = 'Yora Tutoring Session';

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
    private readonly zoomService: ZoomService,
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
      booking: session.booking
        ? {
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
    if (!session || session.zoomJoinUrl || !session.booking) return;

    try {
      const durationMinutes = Math.round(
        (session.booking.endTime.getTime() -
          session.booking.startTime.getTime()) /
          60_000,
      );
      const meeting = await this.zoomService.createMeeting(
        MEETING_TOPIC,
        session.booking.startTime,
        durationMinutes,
      );
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          zoomMeetingId: String(meeting.id),
          zoomJoinUrl: meeting.join_url,
          zoomStartUrl: meeting.start_url,
          zoomPassword: meeting.password,
        },
      });
    } catch (err) {
      this.logger.error('Zoom meeting provisioning failed', err);
    }
  }

  async retryMeeting(userId: string, sessionId: string) {
    const session = await this.assertParticipant(userId, sessionId);
    if (!this.isTutor(session, userId)) {
      throw new NotFoundException('Session not found');
    }
    if (session.zoomJoinUrl) {
      throw new ConflictException(
        'A meeting has already been provisioned for this session',
      );
    }
    await this.provisionMeeting(sessionId);
    return this.getMeetingDetails(userId, sessionId);
  }

  async getMeetingDetails(userId: string, sessionId: string) {
    const session = await this.assertParticipant(userId, sessionId);
    const isTutor = this.isTutor(session, userId);

    if (!session.zoomJoinUrl) {
      return { status: 'not_provisioned' as const, canJoinYet: false };
    }

    const canJoinYet = this.computeCanJoinYet(session.booking);

    if (isTutor) {
      return {
        status: 'provisioned' as const,
        canJoinYet,
        joinUrl: session.zoomStartUrl,
        password: session.zoomPassword,
      };
    }
    return {
      status: 'provisioned' as const,
      canJoinYet,
      joinUrl: session.zoomJoinUrl,
      password: session.zoomPassword,
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
  async deprovisionMeeting(sessionId: string): Promise<void> {
    try {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { zoomMeetingId: true },
      });
      if (!session?.zoomMeetingId) return;

      await this.zoomService.deleteMeeting(session.zoomMeetingId);
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          zoomMeetingId: null,
          zoomJoinUrl: null,
          zoomStartUrl: null,
          zoomPassword: null,
        },
      });
    } catch (err) {
      this.logger.error('Zoom meeting cleanup failed', err);
    }
  }

  async join(userId: string, sessionId: string): Promise<{ joined: true }> {
    const session = await this.assertParticipant(userId, sessionId);
    const now = new Date();

    if (this.isTutor(session, userId)) {
      await this.prisma.session.updateMany({
        where: { id: sessionId, tutorJoinedAt: null },
        data: { tutorJoinedAt: now },
      });
      this.sessionsGateway.emitParticipantJoined(sessionId, 'TUTOR');
    } else {
      await this.prisma.session.updateMany({
        where: { id: sessionId, learnerJoinedAt: null },
        data: { learnerJoinedAt: now },
      });
      this.sessionsGateway.emitParticipantJoined(sessionId, 'LEARNER');
    }
    return { joined: true };
  }
}
