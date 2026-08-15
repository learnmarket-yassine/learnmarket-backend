import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, TutorVerificationStatus } from '@prisma/client';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ListVerificationsQueryDto } from '../dto/list-verifications-query.dto';

const VERIFICATION_QUEUE_USER_SELECT = {
  id: true,
  firstname: true,
  lastname: true,
  avatar: true,
  email: true,
} as const;

const VERIFICATION_DETAIL_INCLUDE = {
  user: {
    select: { ...VERIFICATION_QUEUE_USER_SELECT, country: true, bio: true },
  },
  specialties: { include: { specialty: { include: { category: true } } } },
  skills: { include: { skill: true } },
  certifications: {
    select: {
      id: true,
      title: true,
      issuer: true,
      issuedAt: true,
      expiresAt: true,
      credentialUrl: true,
      files: {
        select: { id: true, fileName: true, mimeType: true, createdAt: true },
      },
    },
  },
  reviewedBy: { select: { firstname: true, lastname: true } },
} as const;

@Injectable()
export class TutorVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async submitForVerification(tutorId: string) {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { userId: tutorId },
      include: {
        user: { select: { bio: true } },
        specialties: true,
        certifications: true,
      },
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');

    if (profile.verificationStatus === TutorVerificationStatus.APPROVED) {
      throw new ConflictException('Your profile is already verified');
    }
    if (profile.verificationStatus === TutorVerificationStatus.PENDING) {
      throw new ConflictException('Your profile is already under review');
    }
    const missing: string[] = [];
    if (!profile.user.bio?.trim()) missing.push('a bio');
    if (profile.specialties.length === 0) {
      missing.push('at least one specialty');
    }
    if (profile.certifications.length === 0) {
      missing.push('at least one certification');
    }
    if (missing.length > 0) {
      throw new BadRequestException(
        `Complete the following before submitting: ${missing.join(', ')}`,
      );
    }

    return this.prisma.tutorProfile.update({
      where: { userId: tutorId },
      data: {
        verificationStatus: TutorVerificationStatus.PENDING,
        submittedAt: new Date(),
      },
    });
  }

  async approve(adminId: string, tutorId: string) {
    const result = await this.prisma.tutorProfile.updateMany({
      where: {
        userId: tutorId,
        verificationStatus: TutorVerificationStatus.PENDING,
      },
      data: {
        verificationStatus: TutorVerificationStatus.APPROVED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNote: null,
      },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'This profile is no longer pending review -- another admin may have already acted on it',
      );
    }
    await this.notifyVerificationUpdated(
      tutorId,
      'Your profile was approved. You can now create proposals.',
    );
    return this.prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: tutorId },
    });
  }

  async reject(adminId: string, tutorId: string, reason: string) {
    const result = await this.prisma.tutorProfile.updateMany({
      where: {
        userId: tutorId,
        verificationStatus: TutorVerificationStatus.PENDING,
      },
      data: {
        verificationStatus: TutorVerificationStatus.REJECTED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNote: reason,
      },
    });
    if (result.count === 0) {
      throw new ConflictException('This profile is no longer pending review');
    }
    await this.notifyVerificationUpdated(
      tutorId,
      'Your verification submission was rejected. Check your profile for details.',
    );
    return this.prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: tutorId },
    });
  }

  async revoke(adminId: string, tutorId: string, reason: string) {
    const result = await this.prisma.tutorProfile.updateMany({
      where: {
        userId: tutorId,
        verificationStatus: TutorVerificationStatus.APPROVED,
      },
      data: {
        verificationStatus: TutorVerificationStatus.REVOKED,
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNote: reason,
      },
    });
    if (result.count === 0) {
      throw new ConflictException('Only approved profiles can be revoked');
    }
    await this.notifyVerificationUpdated(
      tutorId,
      'Your verified status was revoked. Check your profile for details.',
    );
    return this.prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: tutorId },
    });
  }

  private notifyVerificationUpdated(tutorId: string, message: string) {
    return this.notifications.create(
      tutorId,
      NotificationType.VERIFICATION_UPDATED,
      'Verification status updated',
      message,
    );
  }

  async listPendingVerifications(query: ListVerificationsQueryDto) {
    const { page, take } = query;
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.tutorProfile.findMany({
        where: { verificationStatus: TutorVerificationStatus.PENDING },
        orderBy: { submittedAt: 'asc' },
        skip: page * take,
        take,
        include: { user: { select: VERIFICATION_QUEUE_USER_SELECT } },
      }),
      this.prisma.tutorProfile.count({
        where: { verificationStatus: TutorVerificationStatus.PENDING },
      }),
    ]);
    return { paginatedResult: items, totalCount };
  }

  async getVerificationDetail(tutorId: string) {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { userId: tutorId },
      include: VERIFICATION_DETAIL_INCLUDE,
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');
    return profile;
  }
}
