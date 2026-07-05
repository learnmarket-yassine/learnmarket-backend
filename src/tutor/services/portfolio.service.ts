import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorProfileService } from './tutor-profile.service';
import { CreatePortfolioDto } from '../dto/portfolio/create-portfolio.dto';
import { UpdatePortfolioDto } from '../dto/portfolio/update-portfolio.dto';
import { UploadService } from '../../storage/upload.service';
import { UploadPurpose } from '../../storage/upload-purpose.enum';

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
    const images = await this.prisma.portfolioImage.findMany({
      where: { portfolioItemId: itemId },
      select: { key: true },
    });
    await this.prisma.portfolioItem.delete({ where: { id: itemId } });
    await Promise.all(
      images.map((image) => this.uploads.deleteIfPresent(image.key)),
    );
  }

  async addImage(userId: string, itemId: string, key: string) {
    await this.assertOwnership(userId, itemId);
    await this.uploads.finalize(userId, UploadPurpose.PORTFOLIO_IMAGE, key);

    const position = await this.prisma.portfolioImage.count({
      where: { portfolioItemId: itemId },
    });
    const image = await this.prisma.portfolioImage.create({
      data: { portfolioItemId: itemId, key, position },
    });
    return { ...image, url: this.uploads.getPublicUrl(image.key) };
  }

  async removeImage(userId: string, itemId: string, imageId: string) {
    await this.assertOwnership(userId, itemId);
    const image = await this.prisma.portfolioImage.findUnique({
      where: { id: imageId },
    });
    if (!image || image.portfolioItemId !== itemId) {
      throw new NotFoundException('Portfolio image not found');
    }
    await this.prisma.portfolioImage.delete({ where: { id: imageId } });
    await this.uploads.deleteIfPresent(image.key);
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
