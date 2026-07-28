import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TutorVerificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ListVerificationsQueryDto } from '../dto/list-verifications-query.dto';

// Shared across the queue row and the detail screen so the two responses
// describe the same tutor consistently.
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
  // Certification file keys are never returned directly -- only metadata.
  // The admin fetches a short-lived signed URL per file on demand via
  // TutorVerificationService.getCertificationFileUrl, the same
  // access-on-demand pattern the tutor's own certification endpoints use.
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
  constructor(private readonly prisma: PrismaService) {}

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
    // Valid starting states reaching here: UNSUBMITTED, REJECTED, REVOKED.

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

    // Deliberately does NOT clear reviewedBy/reviewedAt/reviewNote here --
    // if this submission follows a rejection, the tutor should still be
    // able to see their previous rejection reason as context while the new
    // review is pending. It's overwritten only when the admin makes their
    // next actual decision (approve/reject/revoke below).
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
      // The status condition in the where clause is what closes the race:
      // if another admin already acted, this matches zero rows instead of
      // overwriting their decision.
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
    return this.prisma.tutorProfile.findUniqueOrThrow({
      where: { userId: tutorId },
    });
  }

  async listPendingVerifications(query: ListVerificationsQueryDto) {
    const { page, take } = query;
    const [items, totalCount] = await this.prisma.$transaction([
      this.prisma.tutorProfile.findMany({
        where: { verificationStatus: TutorVerificationStatus.PENDING },
        orderBy: { submittedAt: 'asc' }, // oldest first -- first submitted, first reviewed
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
