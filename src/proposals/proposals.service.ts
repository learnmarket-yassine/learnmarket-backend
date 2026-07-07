import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AnnonceStatus, ProposalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectsService } from '../connects/connects.service';
import { CreateProposalDto } from './dto/create-proposal.dto';

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connects: ConnectsService,
  ) {}

  async create(userId: string, annonceId: string, dto: CreateProposalDto) {
    const tutorProfile = await this.resolveTutorProfileId(userId);

    const annonce = await this.prisma.annonce.findUnique({
      where: { id: annonceId },
    });
    if (!annonce) throw new NotFoundException('Annonce not found');
    if (annonce.status !== AnnonceStatus.OPEN) {
      throw new BadRequestException(
        'This annonce is no longer accepting proposals',
      );
    }

    const existing = await this.prisma.proposal.findUnique({
      where: { annonceId_tutorId: { annonceId, tutorId: tutorProfile } },
    });
    if (existing) {
      throw new ConflictException(
        'You already submitted a proposal for this annonce',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.proposal.create({
        data: { annonceId, tutorId: tutorProfile, message: dto.message },
      });
      await this.connects.spend(tx, tutorProfile, annonce.proposalCost, {
        relatedProposalId: proposal.id,
      });
      return proposal;
    });
  }

  async findMine(userId: string) {
    const tutorProfile = await this.resolveTutorProfileId(userId);
    return this.prisma.proposal.findMany({
      where: { tutorId: tutorProfile },
      orderBy: { createdAt: 'desc' },
      include: { annonce: true },
    });
  }

  /** No refund on withdrawal — matches Upwork's model. Disputes go through ConnectsService.refundConnects instead. */
  async withdraw(userId: string, proposalId: string) {
    const tutorProfile = await this.resolveTutorProfileId(userId);
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal || proposal.tutorId !== tutorProfile) {
      throw new NotFoundException('Proposal not found');
    }
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new BadRequestException('Only pending proposals can be withdrawn');
    }

    return this.prisma.proposal.update({
      where: { id: proposalId },
      data: { status: ProposalStatus.WITHDRAWN },
    });
  }

  /** No refund on decline either — same rationale as withdraw(). */
  async decline(userId: string, proposalId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { annonce: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.annonce.learnerId !== userId) {
      throw new ForbiddenException(
        'Only the annonce owner can decline a proposal',
      );
    }
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new BadRequestException('Only pending proposals can be declined');
    }

    return this.prisma.proposal.update({
      where: { id: proposalId },
      data: { status: ProposalStatus.DECLINED },
    });
  }

  private async resolveTutorProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.tutorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Tutor profile not found');
    return profile.id;
  }
}
