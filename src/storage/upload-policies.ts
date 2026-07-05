import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UploadPurpose } from './upload-purpose.enum';

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'];

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
};

export function getUploadPolicy(purpose: UploadPurpose): UploadPolicy {
  return UPLOAD_POLICIES[purpose];
}

/** Keys are namespaced as `{prefix}/{ownerId}/{uuid}.{ext}` so ownership can be verified without a DB round trip. */
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
