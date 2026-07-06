import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PortfolioMediaType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorProfileService } from './tutor-profile.service';
import { CreatePortfolioDto } from '../dto/portfolio/create-portfolio.dto';
import { UpdatePortfolioDto } from '../dto/portfolio/update-portfolio.dto';
import { AddPortfolioMediaDto } from '../dto/portfolio/add-portfolio-media.dto';
import { UploadService } from '../../storage/upload.service';
import { UploadPurpose } from '../../storage/upload-purpose.enum';

const FILE_BACKED_MEDIA_TYPES = new Set<PortfolioMediaType>([
  PortfolioMediaType.IMAGE,
  PortfolioMediaType.VIDEO_FILE,
]);

const UPLOAD_PURPOSE_BY_MEDIA_TYPE: Partial<
  Record<PortfolioMediaType, UploadPurpose>
> = {
  [PortfolioMediaType.IMAGE]: UploadPurpose.PORTFOLIO_IMAGE,
  [PortfolioMediaType.VIDEO_FILE]: UploadPurpose.PORTFOLIO_VIDEO,
};

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorProfile: TutorProfileService,
    private readonly uploads: UploadService,
  ) {}

  async add(userId: string, dto: CreatePortfolioDto) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    return this.prisma.portfolioItem.create({ data: { ...dto, profileId } });
  }

  async update(userId: string, itemId: string, dto: UpdatePortfolioDto) {
    await this.assertOwnership(userId, itemId);
    return this.prisma.portfolioItem.update({
      where: { id: itemId },
      data: dto,
    });
  }

  async remove(userId: string, itemId: string) {
    await this.assertOwnership(userId, itemId);
    const media = await this.prisma.portfolioMedia.findMany({
      where: { portfolioItemId: itemId },
      select: { key: true },
    });
    await this.prisma.portfolioItem.delete({ where: { id: itemId } });
    await Promise.all(
      media.map((item) => this.uploads.deleteIfPresent(item.key)),
    );
  }

  async addMedia(userId: string, itemId: string, dto: AddPortfolioMediaDto) {
    await this.assertOwnership(userId, itemId);

    if (FILE_BACKED_MEDIA_TYPES.has(dto.type)) {
      if (!dto.key) {
        throw new BadRequestException(
          `A storage key is required for ${dto.type} media`,
        );
      }
      await this.uploads.finalize(
        userId,
        UPLOAD_PURPOSE_BY_MEDIA_TYPE[dto.type]!,
        dto.key,
      );
    } else if (!dto.url) {
      throw new BadRequestException(`A URL is required for ${dto.type} media`);
    }

    const position = await this.prisma.portfolioMedia.count({
      where: { portfolioItemId: itemId },
    });
    return this.prisma.portfolioMedia.create({
      data: {
        portfolioItemId: itemId,
        type: dto.type,
        key: dto.key,
        url: dto.url,
        position,
      },
    });
  }

  async removeMedia(userId: string, itemId: string, mediaId: string) {
    await this.assertOwnership(userId, itemId);
    const media = await this.prisma.portfolioMedia.findUnique({
      where: { id: mediaId },
    });
    if (!media || media.portfolioItemId !== itemId) {
      throw new NotFoundException('Portfolio media not found');
    }
    await this.prisma.portfolioMedia.delete({ where: { id: mediaId } });
    await this.uploads.deleteIfPresent(media.key);
  }

  private async assertOwnership(userId: string, itemId: string) {
    const profileId = await this.tutorProfile.resolveProfileId(userId);
    const item = await this.prisma.portfolioItem.findUnique({
      where: { id: itemId },
      select: { profileId: true },
    });
    if (!item) throw new NotFoundException('Portfolio item not found');
    if (item.profileId !== profileId)
      throw new ForbiddenException('Access denied');
  }
}
