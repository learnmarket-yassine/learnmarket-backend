import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TutorProfileService } from './tutor-profile.service';
import { CreatePortfolioDto } from '../dto/portfolio/create-portfolio.dto';
import { UpdatePortfolioDto } from '../dto/portfolio/update-portfolio.dto';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tutorProfile: TutorProfileService,
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
    await this.prisma.portfolioItem.delete({ where: { id: itemId } });
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
