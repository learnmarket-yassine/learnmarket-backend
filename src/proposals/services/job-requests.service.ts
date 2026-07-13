import { Injectable, NotFoundException } from '@nestjs/common';
import { JobRequest } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateJobRequestDto } from '../dto/create-job-request.dto';
import { UpdateJobRequestDto } from '../dto/update-job-request.dto';

@Injectable()
export class JobRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  create(learnerId: string, dto: CreateJobRequestDto) {
    return this.prisma.jobRequest.create({ data: { learnerId, ...dto } });
  }

  findAllForLearner(learnerId: string) {
    return this.prisma.jobRequest.findMany({
      where: { learnerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(learnerId: string, id: string) {
    return this.findOwned(learnerId, id);
  }

  async update(learnerId: string, id: string, dto: UpdateJobRequestDto) {
    await this.findOwned(learnerId, id);
    return this.prisma.jobRequest.update({ where: { id }, data: dto });
  }

  async remove(learnerId: string, id: string) {
    await this.findOwned(learnerId, id);
    await this.prisma.jobRequest.delete({ where: { id } });
  }

  private async findOwned(learnerId: string, id: string): Promise<JobRequest> {
    const jobRequest = await this.prisma.jobRequest.findFirst({
      where: { id, learnerId },
    });
    if (!jobRequest) throw new NotFoundException('Job request not found');
    return jobRequest;
  }
}
