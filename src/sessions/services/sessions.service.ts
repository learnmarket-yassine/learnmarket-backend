import {
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadPurpose } from '../../storage/upload-purpose.enum';
import { UploadService } from '../../storage/upload.service';
import { AttachFileDto } from '../../storage/dto/attach-file.dto';
import { ZoomService } from './zoom.service';
import { SessionsGateway } from '../gateways/sessions.gateway';

const MEETING_TOPIC = 'Yora Tutoring Session';

// A learner/tutor can join up to 15 minutes before the scheduled start, and
// up to 30 minutes after the scheduled end (grace window for overruns).
const JOIN_WINDOW_BEFORE_MS = 15 * 60_000;
const JOIN_GRACE_AFTER_MS = 30 * 60_000;

const SESSION_WITH_PARTICIPANTS = {
  proposal: { include: { learnRequest: true } },
  booking: true,
} as const;

type SessionWithParticipants = Awaited<
  ReturnType<SessionsService['assertParticipant']>
>;

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly zoomService: ZoomService,
    private readonly uploadService: UploadService,
    @Inject(forwardRef(() => SessionsGateway))
    private readonly sessionsGateway: SessionsGateway,
  ) {}

  // 404, not 403 -- a caller with no legitimate relationship to this
  // session has no reason to learn it exists at all (same pattern as
  // ProposalsService.assertViewable / MessagingService.assertParticipant).
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

  private isTutor(session: SessionWithParticipants, userId: string): boolean {
    return session.proposal.tutorId === userId;
  }

  /**
   * Safe, non-sensitive session context for the room page (title, objective,
   * schedule, join indicators) -- explicitly whitelisted fields, never a raw
   * spread of the session record, since that record also carries the zoom*
   * columns via assertParticipant's include.
   */
  async getSessionContext(userId: string, sessionId: string) {
    const session = await this.assertParticipant(userId, sessionId);
    return {
      id: session.id,
      title: session.title,
      objective: session.objective,
      status: session.status,
      isTutor: this.isTutor(session, userId),
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

  /**
   * Creates the Zoom meeting for a session's confirmed booking, if one
   * doesn't already exist. Never throws -- called both right after booking
   * confirmation (where a Zoom outage must not block the booking) and from
   * the tutor-triggered retry endpoint (where the caller wants to see the
   * failure, but as a normal service response, not an unhandled crash).
   */
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

  /**
   * Role-scoped by construction: zoomStartUrl is only ever read inside the
   * isTutor branch below, and that branch's return value is never merged
   * with or derived from anything the non-tutor branch touches.
   */
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

  /**
   * Removes the Zoom meeting (if any) for a session whose booking was just
   * cancelled. Never throws -- a Zoom cleanup failure must not block the
   * cancellation that already committed.
   */
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

  // ---------------------------------------------------------------------
  // Attachments
  // ---------------------------------------------------------------------

  async addAttachment(userId: string, sessionId: string, dto: AttachFileDto) {
    await this.assertParticipant(userId, sessionId);
    const head = await this.uploadService.finalize(
      userId,
      UploadPurpose.SESSION_ATTACHMENT,
      dto.key,
    );
    return this.prisma.sessionAttachment.create({
      data: {
        sessionId,
        uploaderId: userId,
        key: dto.key,
        fileName: dto.fileName ?? dto.key.split('/').pop() ?? 'file',
        mimeType: dto.mimeType ?? head.contentType ?? null,
        fileSize: head.contentLength ?? null,
      },
    });
  }

  async listAttachments(userId: string, sessionId: string) {
    await this.assertParticipant(userId, sessionId);
    return this.prisma.sessionAttachment.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      include: {
        uploader: { select: { id: true, firstname: true, lastname: true } },
      },
    });
  }

  async getAttachmentUrl(
    userId: string,
    sessionId: string,
    attachmentId: string,
  ) {
    await this.assertParticipant(userId, sessionId);
    const attachment = await this.findOwnedAttachment(sessionId, attachmentId, {
      requireUploader: false,
      userId,
    });
    return this.uploadService.getSignedDownloadUrl(attachment.key);
  }

  async removeAttachment(
    userId: string,
    sessionId: string,
    attachmentId: string,
  ) {
    await this.assertParticipant(userId, sessionId);
    const attachment = await this.findOwnedAttachment(sessionId, attachmentId, {
      requireUploader: true,
      userId,
    });
    await this.prisma.sessionAttachment.delete({ where: { id: attachmentId } });
    await this.uploadService.deleteIfPresent(attachment.key);
  }

  private async findOwnedAttachment(
    sessionId: string,
    attachmentId: string,
    opts: { requireUploader: boolean; userId: string },
  ) {
    const attachment = await this.prisma.sessionAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment || attachment.sessionId !== sessionId) {
      throw new NotFoundException('Attachment not found');
    }
    if (opts.requireUploader && attachment.uploaderId !== opts.userId) {
      throw new ForbiddenException('You can only delete your own files');
    }
    return attachment;
  }
}
