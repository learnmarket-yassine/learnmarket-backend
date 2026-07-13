import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateJobRequestDto } from '../dto/create-job-request.dto';
import { UpdateJobRequestDto } from '../dto/update-job-request.dto';
import { JobRequestsService } from '../services/job-requests.service';

@Controller('job-requests')
@UseGuards(RolesGuard)
@Roles(UserRole.LEARNER)
export class JobRequestsController {
  constructor(private readonly jobRequests: JobRequestsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('id') learnerId: string,
    @Body() dto: CreateJobRequestDto,
  ) {
    return this.jobRequests.create(learnerId, dto);
  }

  @Get()
  findAll(@CurrentUser('id') learnerId: string) {
    return this.jobRequests.findAllForLearner(learnerId);
  }

  @Get(':id')
  findOne(@CurrentUser('id') learnerId: string, @Param('id') id: string) {
    return this.jobRequests.findOne(learnerId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') learnerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateJobRequestDto,
  ) {
    return this.jobRequests.update(learnerId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') learnerId: string, @Param('id') id: string) {
    return this.jobRequests.remove(learnerId, id);
  }
}
