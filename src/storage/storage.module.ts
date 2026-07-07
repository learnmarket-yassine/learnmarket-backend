import { Global, Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { UploadService } from './upload.service';
import { UploadsController } from './uploads.controller';

@Global()
@Module({
  controllers: [UploadsController],
  providers: [S3Service, UploadService],
  exports: [S3Service, UploadService],
})
export class StorageModule {}
