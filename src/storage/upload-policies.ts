import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UploadPurpose } from './upload-purpose.enum';

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'];
const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export interface UploadPolicy {
  keyPrefix: string;
  maxSizeBytes: number;
  allowedMimeTypes: string[];
  visibility: 'public' | 'private';
  requiredRole?: UserRole;
}

export const UPLOAD_POLICIES: Record<UploadPurpose, UploadPolicy> = {
  [UploadPurpose.AVATAR]: {
    keyPrefix: 'avatars',
    maxSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: IMAGE_MIME_TYPES,
    visibility: 'public',
  },
  [UploadPurpose.PORTFOLIO_IMAGE]: {
    keyPrefix: 'portfolio',
    maxSizeBytes: 8 * 1024 * 1024,
    allowedMimeTypes: IMAGE_MIME_TYPES,
    visibility: 'public',
    requiredRole: UserRole.TUTOR,
  },
  [UploadPurpose.PORTFOLIO_VIDEO]: {
    keyPrefix: 'portfolio-videos',
    maxSizeBytes: 100 * 1024 * 1024,
    allowedMimeTypes: VIDEO_MIME_TYPES,
    visibility: 'public',
    requiredRole: UserRole.TUTOR,
  },
  [UploadPurpose.CERTIFICATION_FILE]: {
    keyPrefix: 'certifications',
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
    visibility: 'private',
    requiredRole: UserRole.TUTOR,
  },
  [UploadPurpose.EMPLOYMENT_CERTIFICATE]: {
    keyPrefix: 'employment-certificates',
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
    visibility: 'private',
    requiredRole: UserRole.TUTOR,
  },
  [UploadPurpose.ANNOUNCEMENT_ATTACHMENT]: {
    keyPrefix: 'announcement-attachments',
    maxSizeBytes: 20 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
    visibility: 'private',
    // No requiredRole -- either participant can post an announcement.
  },
  [UploadPurpose.ASSIGNMENT_ATTACHMENT]: {
    keyPrefix: 'assignment-attachments',
    maxSizeBytes: 20 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
    visibility: 'private',
    requiredRole: UserRole.TUTOR,
  },
  [UploadPurpose.SUBMISSION_ATTACHMENT]: {
    keyPrefix: 'submission-attachments',
    maxSizeBytes: 20 * 1024 * 1024,
    allowedMimeTypes: DOCUMENT_MIME_TYPES,
    visibility: 'private',
    requiredRole: UserRole.LEARNER,
  },
};

export function getUploadPolicy(purpose: UploadPurpose): UploadPolicy {
  return UPLOAD_POLICIES[purpose];
}

export function assertKeyOwnership(
  key: string,
  purpose: UploadPurpose,
  ownerId: string,
): void {
  const policy = getUploadPolicy(purpose);
  const expectedPrefix = `${policy.keyPrefix}/${ownerId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new ForbiddenException('Invalid file reference');
  }
}
