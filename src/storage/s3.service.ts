import { randomUUID } from 'crypto';
import { extname } from 'path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_PRESIGN_EXPIRY_SECONDS = 300;

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    const region = this.config.getOrThrow<string>('AWS_REGION');
    this.bucket = this.config.getOrThrow<string>('AWS_S3_BUCKET');

    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');

    this.client = new S3Client({
      region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });

    this.publicBaseUrl =
      this.config.get<string>('AWS_S3_PUBLIC_BASE_URL') ??
      `https://${this.bucket}.s3.${region}.amazonaws.com`;
  }

  buildKey(prefix: string, ownerId: string, fileName: string): string {
    const ext = extname(fileName).toLowerCase();
    return `${prefix}/${ownerId}/${randomUUID()}${ext}`;
  }

  async createPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = DEFAULT_PRESIGN_EXPIRY_SECONDS,
  ): Promise<{ url: string; expiresIn: number }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
    return { url, expiresIn: expiresInSeconds };
  }

  async createPresignedDownloadUrl(
    key: string,
    expiresInSeconds = DEFAULT_PRESIGN_EXPIRY_SECONDS,
  ): Promise<{ url: string; expiresIn: number }> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
    return { url, expiresIn: expiresInSeconds };
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  async headObject(
    key: string,
  ): Promise<{ contentLength?: number; contentType?: string } | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        contentLength: result.ContentLength,
        contentType: result.ContentType,
      };
    } catch (err) {
      if (err instanceof NotFound) return null;
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
