import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitFeedbackDto } from '../dto/submit-feedback.dto';

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

    if (!isTutor && !isLearner)
      throw new NotFoundException('Proposal not found');

    if (isTutor) {
      throw new ForbiddenException(
        'Only the learner can leave feedback for this course',
      );
    }

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

    return this.prisma.feedback.create({
      data: {
        proposalId,
        authorId,
        aboutUserId: proposal.tutorId,
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

    return proposal.feedbacks;
  }

  async getTutorRatingSummary(tutorId: string) {
    const result = await this.prisma.feedback.aggregate({
      where: { aboutUserId: tutorId },
      _avg: { rating: true },
      _count: true,
    });
    return {
      averageRating: result._avg.rating ?? null,
      reviewCount: result._count,
    };
  }

  async getTutorFeedbackList(tutorId: string) {
    const feedbacks = await this.prisma.feedback.findMany({
      where: { aboutUserId: tutorId },
      include: {
        author: {
          select: { id: true, firstname: true, lastname: true, avatar: true },
        },
        proposal: { include: { learnRequest: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return feedbacks.map(
      ({ id, rating, comment, createdAt, author, proposal }) => ({
        id,
        rating,
        comment,
        createdAt,
        author,
        learnRequestTitle: proposal.learnRequest.title,
        engagementStart: proposal.createdAt,
        engagementEnd: proposal.learnRequest.completedAt,
        billedAmount: proposal.totalPrice,
      }),
    );
  }
}
