import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ShortlistedProposalsService {
  constructor(private readonly prisma: PrismaService) {}

  async shortlist(learnerId: string, proposalId: string) {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id: proposalId, learnRequest: { learnerId } },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');

    const existing = await this.prisma.shortlistedProposal.findUnique({
      where: { learnerId_proposalId: { learnerId, proposalId } },
    });
    if (existing) {
      throw new ConflictException('You already shortlisted this proposal');
    }

    return this.prisma.shortlistedProposal.create({
      data: { learnerId, proposalId },
    });
  }

  async unshortlist(learnerId: string, proposalId: string) {
    const { count } = await this.prisma.shortlistedProposal.deleteMany({
      where: { learnerId, proposalId },
    });
    if (count === 0) throw new NotFoundException('Not currently shortlisted');
  }
}
