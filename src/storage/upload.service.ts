import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { S3Service } from './s3.service';
import { UploadPurpose } from './upload-purpose.enum';
import { assertKeyOwnership, getUploadPolicy } from './upload-policies';
import { PresignUploadDto } from './dto/presign-upload.dto';

@Injectable()
export class UploadService {
  constructor(private readonly s3: S3Service) {}

  async presign(
    ownerId: string,
    ownerRole: UserRole,
    dto: PresignUploadDto,
  ): Promise<{ key: string; uploadUrl: string; expiresIn: number }> {
    const policy = getUploadPolicy(dto.purpose);

    if (policy.requiredRole && policy.requiredRole !== ownerRole) {
      throw new ForbiddenException(
        `Only ${policy.requiredRole} accounts can upload this file type`,
      );
    }
    if (!policy.allowedMimeTypes.includes(dto.contentType)) {
      throw new BadRequestException(
        `Unsupported content type for ${dto.purpose}. Allowed: ${policy.allowedMimeTypes.join(', ')}`,
      );
    }

    const key = this.s3.buildKey(policy.keyPrefix, ownerId, dto.fileName);
    const { url, expiresIn } = await this.s3.createPresignedUploadUrl(
      key,
      dto.contentType,
    );
    return { key, uploadUrl: url, expiresIn };
  }

  /**
   * Verifies a client-reported key actually belongs to this owner/purpose and
   * matches the uploaded object's real size/type before it's persisted to the DB.
   * Guards against a client lying in the presign step or replaying someone else's key.
   */
  async finalize(
    ownerId: string,
    purpose: UploadPurpose,
    key: string,
  ): Promise<{ contentType?: string; contentLength?: number }> {
    assertKeyOwnership(key, purpose, ownerId);

    const policy = getUploadPolicy(purpose);
    const head = await this.s3.headObject(key);
    if (!head) {
      throw new BadRequestException(
        'Upload not found in storage — did the upload to S3 complete?',
      );
    }
    if (head.contentLength && head.contentLength > policy.maxSizeBytes) {
      await this.s3.deleteObject(key);
      throw new BadRequestException('File exceeds the maximum allowed size');
    }
    if (
      head.contentType &&
      !policy.allowedMimeTypes.includes(head.contentType)
    ) {
      await this.s3.deleteObject(key);
      throw new BadRequestException('Unsupported file type');
    }
    return head;
  }

  async deleteIfPresent(key: string | null | undefined): Promise<void> {
    if (!key) return;
    await this.s3.deleteObject(key);
  }

  getPublicUrl(key: string): string {
    return this.s3.getPublicUrl(key);
  }

  async getSignedDownloadUrl(
    key: string,
  ): Promise<{ url: string; expiresIn: number }> {
    return this.s3.createPresignedDownloadUrl(key);
  }
}
