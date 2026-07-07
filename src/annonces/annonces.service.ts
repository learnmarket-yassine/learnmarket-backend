import { Injectable, NotFoundException } from '@nestjs/common';
import { AnnonceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PROPOSAL_COST } from '../connects/connects.constants';
import { CreateAnnonceDto } from './dto/create-annonce.dto';

@Injectable()
export class AnnoncesService {
  constructor(private readonly prisma: PrismaService) {}

  create(learnerId: string, dto: CreateAnnonceDto) {
    return this.prisma.annonce.create({
      data: {
        learnerId,
        title: dto.title,
        description: dto.description,
        proposalCost: dto.proposalCost ?? DEFAULT_PROPOSAL_COST,
      },
    });
  }

  findOpen() {
    return this.prisma.annonce.findMany({
      where: { status: AnnonceStatus.OPEN },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const annonce = await this.prisma.annonce.findUnique({ where: { id } });
    if (!annonce) throw new NotFoundException('Annonce not found');
    return annonce;
  }
}
