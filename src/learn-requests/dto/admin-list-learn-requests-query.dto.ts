import { LearnRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class AdminListLearnRequestsQueryDto {
  @IsOptional()
  @IsEnum(LearnRequestStatus)
  status?: LearnRequestStatus;
}
