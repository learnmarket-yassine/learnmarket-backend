import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitFeedbackDto } from '../dto/submit-feedback.dto';
import { REVEAL_FALLBACK_DAYS } from '../constants/feedback.constants';

export interface HiddenFeedback {
  id: string;
  authorId: string;
  aboutUserId: string;
  status: 'hidden';
}

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async submitFeedback(
    authorId: string,
    proposalId: string,
    dto: SubmitFeedbackDto,
  ) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { learnRequest: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');

    const isTutor = proposal.tutorId === authorId;
    const isLearner = proposal.learnRequest.learnerId === authorId;
    // 404, not 403 -- same discipline as every ownership check in this codebase
    if (!isTutor && !isLearner)
      throw new NotFoundException('Proposal not found');

    if (
      proposal.status !== 'ACCEPTED' ||
      proposal.learnRequest.status !== 'COMPLETED'
    ) {
      throw new ConflictException(
        'Feedback can only be left once the course is fully completed',
      );
    }

    const existing = await this.prisma.feedback.findUnique({
      where: { proposalId_authorId: { proposalId, authorId } },
    });
    if (existing) {
      throw new ConflictException(
        'You have already left feedback for this course',
      );
    }

    const aboutUserId = isTutor
      ? proposal.learnRequest.learnerId
      : proposal.tutorId;

    return this.prisma.feedback.create({
      data: {
        proposalId,
        authorId,
        aboutUserId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });
  }

  async getFeedbackForProposal(viewerId: string, proposalId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { learnRequest: true, feedbacks: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');

    const isParticipant =
      proposal.tutorId === viewerId ||
      proposal.learnRequest.learnerId === viewerId;
    if (!isParticipant) throw new NotFoundException('Proposal not found');

    const bothSubmitted = proposal.feedbacks.length === 2;
    const deadlinePassed = proposal.learnRequest.completedAt
      ? Date.now() - proposal.learnRequest.completedAt.getTime() >
        REVEAL_FALLBACK_DAYS * 86_400_000
      : false;
    const isRevealed = bothSubmitted || deadlinePassed;

    return proposal.feedbacks.map((f) => {
      // The viewer's OWN submitted feedback is always visible to them --
      // double-blind only hides the OTHER party's, never your own.
      if (f.authorId === viewerId || isRevealed) return f;

      // No rating/comment leaked in the hidden case -- omit the fields
      // entirely, don't just mask them client-side.
      const hidden: HiddenFeedback = {
        id: f.id,
        authorId: f.authorId,
        aboutUserId: f.aboutUserId,
        status: 'hidden',
      };
      return hidden;
    });
  }

  async getTutorRatingSummary(tutorId: string) {
    const result = await this.prisma.feedback.aggregate({
      where: { aboutUserId: tutorId },
      _avg: { rating: true },
      _count: true,
    });
    // null average (not 0) when reviewCount is 0 -- a tutor with no reviews
    // yet should show "No reviews yet", not a misleading "0 stars"
    return {
      averageRating: result._avg.rating ?? null,
      reviewCount: result._count,
    };
  }
}
