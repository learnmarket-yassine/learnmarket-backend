import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubmissionStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AttachFileDto } from '../../storage/dto/attach-file.dto';
import { UploadPurpose } from '../../storage/upload-purpose.enum';
import { UploadService } from '../../storage/upload.service';
import { CreateAssignmentDto } from '../dto/create-assignment.dto';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { PresignSubmissionAttachmentDto } from '../dto/presign-submission-attachment.dto';
import { UpdateAssignmentDto } from '../dto/update-assignment.dto';
import { SessionsService } from './sessions.service';

const AUTHOR_SELECT = {
  id: true,
  firstname: true,
  lastname: true,
  avatar: true,
} as const;

const ASSIGNMENT_INCLUDE = {
  submission: { include: { attachments: true } },
  attachments: true,
  comments: {
    orderBy: { createdAt: 'asc' as const },
    include: { author: { select: AUTHOR_SELECT } },
  },
};

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly uploadService: UploadService,
  ) {}

  // Point-in-time computed label -- never stored, so there's nothing to keep
  // in sync via a background job.
  private computeDisplayStatus(
    status: SubmissionStatus,
    dueAt: Date | null,
  ): SubmissionStatus | 'LATE' {
    if (status === SubmissionStatus.ASSIGNED && dueAt && dueAt < new Date()) {
      return 'LATE';
    }
    return status;
  }

  private async assertAssignmentParticipant(
    userId: string,
    assignmentId: string,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { submission: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const session = await this.sessions.assertParticipant(
      userId,
      assignment.sessionId,
    );
    return { assignment, session };
  }

  async create(tutorId: string, sessionId: string, dto: CreateAssignmentDto) {
    const session = await this.sessions.assertParticipant(tutorId, sessionId);
    if (!this.sessions.isTutor(session, tutorId)) {
      throw new ForbiddenException('Only the tutor can create an assignment');
    }

    const existing = await this.prisma.assignment.findUnique({
      where: { sessionId },
    });
    if (existing) {
      throw new ConflictException('This session already has an assignment');
    }

    const attachments: {
      key: string;
      fileName: string;
      mimeType: string | null;
      fileSize: number | null;
    }[] = [];
    for (const item of dto.attachments ?? []) {
      const head = await this.uploadService.finalize(
        tutorId,
        UploadPurpose.ASSIGNMENT_ATTACHMENT,
        item.key,
      );
      attachments.push({
        key: item.key,
        fileName: item.fileName ?? item.key.split('/').pop() ?? 'file',
        mimeType: item.mimeType ?? head.contentType ?? null,
        fileSize: head.contentLength ?? null,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.assignment.create({
        data: {
          sessionId,
          title: dto.title,
          instructions: dto.instructions,
          dueAt: dto.dueAt,
          attachments: { create: attachments },
        },
      });
      await tx.assignmentSubmission.create({
        data: { assignmentId: created.id },
      });
      // Re-fetch with the full include now that the submission row exists --
      // the initial create's include would have run before it was created.
      const assignment = await tx.assignment.findUniqueOrThrow({
        where: { id: created.id },
        include: ASSIGNMENT_INCLUDE,
      });
      return {
        exists: true as const,
        ...assignment,
        displayStatus: this.computeDisplayStatus(
          SubmissionStatus.ASSIGNED,
          assignment.dueAt,
        ),
      };
    });
  }

  async get(userId: string, sessionId: string) {
    await this.sessions.assertParticipant(userId, sessionId);

    const assignment = await this.prisma.assignment.findUnique({
      where: { sessionId },
      include: ASSIGNMENT_INCLUDE,
    });
    if (!assignment) return { exists: false as const };

    return {
      exists: true as const,
      ...assignment,
      displayStatus: this.computeDisplayStatus(
        assignment.submission?.status ?? SubmissionStatus.ASSIGNED,
        assignment.dueAt,
      ),
    };
  }

  async update(tutorId: string, sessionId: string, dto: UpdateAssignmentDto) {
    const session = await this.sessions.assertParticipant(tutorId, sessionId);
    if (!this.sessions.isTutor(session, tutorId)) {
      throw new ForbiddenException('Only the tutor can edit this assignment');
    }

    const assignment = await this.prisma.assignment.findUnique({
      where: { sessionId },
      include: { submission: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.submission?.status !== SubmissionStatus.ASSIGNED) {
      throw new ConflictException(
        'This assignment can no longer be edited',
      );
    }

    return this.prisma.assignment.update({
      where: { sessionId },
      data: {
        title: dto.title,
        instructions: dto.instructions,
        dueAt: dto.dueAt,
      },
      include: ASSIGNMENT_INCLUDE,
    });
  }

  async presignSubmissionAttachment(
    learnerId: string,
    assignmentId: string,
    dto: PresignSubmissionAttachmentDto,
  ) {
    const { assignment, session } = await this.assertAssignmentParticipant(
      learnerId,
      assignmentId,
    );
    if (this.sessions.isTutor(session, learnerId)) {
      throw new ForbiddenException(
        'Only the learner can submit files for this assignment',
      );
    }
    if (assignment.submission?.status !== SubmissionStatus.ASSIGNED) {
      throw new ConflictException(
        'Files can no longer be added to this submission',
      );
    }

    return this.uploadService.presign(learnerId, UserRole.LEARNER, {
      purpose: UploadPurpose.SUBMISSION_ATTACHMENT,
      fileName: dto.fileName,
      contentType: dto.contentType,
    });
  }

  async addSubmissionAttachment(
    learnerId: string,
    assignmentId: string,
    dto: AttachFileDto,
  ) {
    const { assignment, session } = await this.assertAssignmentParticipant(
      learnerId,
      assignmentId,
    );
    if (this.sessions.isTutor(session, learnerId)) {
      throw new ForbiddenException(
        'Only the learner can submit files for this assignment',
      );
    }
    if (assignment.submission?.status !== SubmissionStatus.ASSIGNED) {
      throw new ConflictException(
        'Files can no longer be added to this submission',
      );
    }

    const head = await this.uploadService.finalize(
      learnerId,
      UploadPurpose.SUBMISSION_ATTACHMENT,
      dto.key,
    );
    return this.prisma.submissionAttachment.create({
      data: {
        submissionId: assignment.submission.id,
        key: dto.key,
        fileName: dto.fileName ?? dto.key.split('/').pop() ?? 'file',
        mimeType: dto.mimeType ?? head.contentType ?? null,
        fileSize: head.contentLength ?? null,
      },
    });
  }

  async removeSubmissionAttachment(
    learnerId: string,
    assignmentId: string,
    attachmentId: string,
  ) {
    const { assignment, session } = await this.assertAssignmentParticipant(
      learnerId,
      assignmentId,
    );
    if (this.sessions.isTutor(session, learnerId)) {
      throw new ForbiddenException(
        'Only the learner can remove files from this assignment',
      );
    }
    if (assignment.submission?.status !== SubmissionStatus.ASSIGNED) {
      throw new ConflictException(
        'Files can no longer be removed from this submission',
      );
    }

    const attachment = await this.prisma.submissionAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment || attachment.submissionId !== assignment.submission.id) {
      throw new NotFoundException('Attachment not found');
    }

    await this.prisma.submissionAttachment.delete({
      where: { id: attachmentId },
    });
    await this.uploadService.deleteIfPresent(attachment.key);
  }

  async completeSubmission(learnerId: string, assignmentId: string) {
    const { assignment, session } = await this.assertAssignmentParticipant(
      learnerId,
      assignmentId,
    );
    if (this.sessions.isTutor(session, learnerId)) {
      throw new ForbiddenException(
        'Only the learner can mark this assignment as done',
      );
    }
    if (assignment.submission?.status !== SubmissionStatus.ASSIGNED) {
      throw new ConflictException(
        'This assignment has already been submitted or excused',
      );
    }

    return this.prisma.assignmentSubmission.update({
      where: { assignmentId },
      data: { status: SubmissionStatus.SUBMITTED, submittedAt: new Date() },
    });
  }

  async excuseSubmission(tutorId: string, assignmentId: string) {
    const { assignment, session } = await this.assertAssignmentParticipant(
      tutorId,
      assignmentId,
    );
    if (!this.sessions.isTutor(session, tutorId)) {
      throw new ForbiddenException('Only the tutor can excuse a submission');
    }
    if (assignment.submission?.status === SubmissionStatus.SUBMITTED) {
      throw new ConflictException(
        'Cannot excuse a submission that has already been turned in',
      );
    }

    return this.prisma.assignmentSubmission.update({
      where: { assignmentId },
      data: { status: SubmissionStatus.EXCUSED },
    });
  }

  async getAttachmentUrl(
    userId: string,
    assignmentId: string,
    attachmentId: string,
  ) {
    await this.assertAssignmentParticipant(userId, assignmentId);
    const attachment = await this.prisma.assignmentAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment || attachment.assignmentId !== assignmentId) {
      throw new NotFoundException('Attachment not found');
    }
    return this.uploadService.getSignedDownloadUrl(attachment.key);
  }

  async getSubmissionAttachmentUrl(
    userId: string,
    assignmentId: string,
    attachmentId: string,
  ) {
    const { assignment } = await this.assertAssignmentParticipant(
      userId,
      assignmentId,
    );
    const attachment = await this.prisma.submissionAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment || attachment.submissionId !== assignment.submission?.id) {
      throw new NotFoundException('Attachment not found');
    }
    return this.uploadService.getSignedDownloadUrl(attachment.key);
  }

  async addComment(userId: string, assignmentId: string, dto: CreateCommentDto) {
    await this.assertAssignmentParticipant(userId, assignmentId);

    return this.prisma.assignmentComment.create({
      data: {
        assignmentId,
        authorId: userId,
        content: dto.content,
      },
      include: { author: { select: AUTHOR_SELECT } },
    });
  }
}
