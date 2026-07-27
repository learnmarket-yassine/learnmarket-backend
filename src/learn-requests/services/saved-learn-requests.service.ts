import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildListInclude,
  LearnRequestsService,
} from './learn-requests.service';

@Injectable()
export class SavedLearnRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly learnRequests: LearnRequestsService,
  ) {}

  async save(tutorId: string, learnRequestId: string) {
    const learnRequest = await this.prisma.learnRequest.findUnique({
      where: { id: learnRequestId },
    });
    if (!learnRequest) throw new NotFoundException('Learn request not found');

    const existing = await this.prisma.savedLearnRequest.findUnique({
      where: { tutorId_learnRequestId: { tutorId, learnRequestId } },
    });
    if (existing) throw new ConflictException('You already saved this request');

    return this.prisma.savedLearnRequest.create({
      data: { tutorId, learnRequestId },
    });
  }

  async unsave(tutorId: string, learnRequestId: string) {
    const { count } = await this.prisma.savedLearnRequest.deleteMany({
      where: { tutorId, learnRequestId },
    });
    if (count === 0) throw new NotFoundException('Not currently saved');
  }

  async listSaved(user: AuthUser, page: number, take: number) {
    const where = { tutorId: user.id };
    const [rows, totalCount] = await this.prisma.$transaction([
      this.prisma.savedLearnRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * take,
        take,
        include: { learnRequest: { include: buildListInclude(user) } },
      }),
      this.prisma.savedLearnRequest.count({ where }),
    ]);

    const paginatedResult = await this.learnRequests.attachDerivedFields(
      rows.map((row) => row.learnRequest),
    );
    return { paginatedResult, totalCount };
  }
}
