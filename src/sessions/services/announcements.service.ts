import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadPurpose } from '../../storage/upload-purpose.enum';
import { UploadService } from '../../storage/upload.service';
import { CreateAnnouncementDto } from '../dto/create-announcement.dto';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { UpdateAnnouncementDto } from '../dto/update-announcement.dto';
import { SessionsService } from './sessions.service';

const AUTHOR_SELECT = {
  id: true,
  firstname: true,
  lastname: true,
  avatar: true,
} as const;

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly uploadService: UploadService,
  ) {}

  async create(
    userId: string,
    sessionId: string,
    dto: CreateAnnouncementDto,
  ) {
    await this.sessions.assertParticipant(userId, sessionId);

    const attachments: {
      key: string;
      fileName: string;
      mimeType: string | null;
      fileSize: number | null;
    }[] = [];
    for (const item of dto.attachments ?? []) {
      const head = await this.uploadService.finalize(
        userId,
        UploadPurpose.ANNOUNCEMENT_ATTACHMENT,
        item.key,
      );
      attachments.push({
        key: item.key,
        fileName: item.fileName ?? item.key.split('/').pop() ?? 'file',
        mimeType: item.mimeType ?? head.contentType ?? null,
        fileSize: head.contentLength ?? null,
      });
    }

    return this.prisma.announcement.create({
      data: {
        sessionId,
        authorId: userId,
        content: dto.content,
        attachments: { create: attachments },
      },
      include: {
        author: { select: AUTHOR_SELECT },
        attachments: true,
        comments: true,
      },
    });
  }

  async list(userId: string, sessionId: string) {
    await this.sessions.assertParticipant(userId, sessionId);
    return this.prisma.announcement.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: AUTHOR_SELECT },
        attachments: true,
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: AUTHOR_SELECT } },
        },
      },
    });
  }

  async update(
    userId: string,
    announcementId: string,
    dto: UpdateAnnouncementDto,
  ) {
    await this.findOwnedByAuthor(userId, announcementId);
    return this.prisma.announcement.update({
      where: { id: announcementId },
      data: { content: dto.content },
      include: {
        author: { select: AUTHOR_SELECT },
        attachments: true,
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: AUTHOR_SELECT } },
        },
      },
    });
  }

  async remove(userId: string, announcementId: string) {
    const announcement = await this.findOwnedByAuthor(userId, announcementId);
    await this.prisma.announcement.delete({ where: { id: announcementId } });
    await Promise.all(
      announcement.attachments.map((attachment) =>
        this.uploadService.deleteIfPresent(attachment.key),
      ),
    );
  }

  private async findOwnedByAuthor(userId: string, announcementId: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      include: { attachments: true },
    });
    if (!announcement) throw new NotFoundException('Announcement not found');

    await this.sessions.assertParticipant(userId, announcement.sessionId);
    if (announcement.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own announcements');
    }
    return announcement;
  }

  async getAttachmentUrl(
    userId: string,
    announcementId: string,
    attachmentId: string,
  ) {
    const attachment = await this.prisma.announcementAttachment.findUnique({
      where: { id: attachmentId },
      include: { announcement: { select: { sessionId: true } } },
    });
    if (!attachment || attachment.announcementId !== announcementId) {
      throw new NotFoundException('Attachment not found');
    }
    await this.sessions.assertParticipant(
      userId,
      attachment.announcement.sessionId,
    );
    return this.uploadService.getSignedDownloadUrl(attachment.key);
  }

  async addComment(
    userId: string,
    announcementId: string,
    dto: CreateCommentDto,
  ) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { sessionId: true },
    });
    if (!announcement) throw new NotFoundException('Announcement not found');

    await this.sessions.assertParticipant(userId, announcement.sessionId);

    return this.prisma.announcementComment.create({
      data: {
        announcementId,
        authorId: userId,
        content: dto.content,
      },
      include: { author: { select: AUTHOR_SELECT } },
    });
  }
}
