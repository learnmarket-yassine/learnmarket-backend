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
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { LearnRequestsService } from '../services/learn-requests.service';
import { CreateLearnRequestDraftDto } from '../dto/create-draft.dto';
import { UpdateLearnRequestDto } from '../dto/update-learn-request.dto';
import { ListLearnRequestsQueryDto } from '../dto/list-learn-requests-query.dto';

@Controller('learn-requests')
@UseGuards(RolesGuard)
export class LearnRequestsController {
  constructor(private readonly learnRequests: LearnRequestsService) {}

  @Post('draft')
  @Roles(UserRole.LEARNER)
  @HttpCode(HttpStatus.CREATED)
  createDraft(
    @CurrentUser('id') learnerId: string,
    @Body() dto: CreateLearnRequestDraftDto,
  ) {
    return this.learnRequests.createDraft(learnerId, dto);
  }

  @Get('mine')
  @Roles(UserRole.LEARNER)
  findMine(@CurrentUser('id') learnerId: string) {
    return this.learnRequests.findMine(learnerId);
  }

  @Get()
  @Roles(UserRole.TUTOR)
  findOpenFeed(@Query() query: ListLearnRequestsQueryDto) {
    return this.learnRequests.findOpenFeed(query);
  }

  @Get(':id')
  findOne(@CurrentUser() viewer: AuthUser, @Param('id') id: string) {
    return this.learnRequests.findOneDetail(viewer, id);
  }

  @Patch(':id')
  @Roles(UserRole.LEARNER)
  update(
    @CurrentUser('id') learnerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLearnRequestDto,
  ) {
    return this.learnRequests.update(learnerId, id, dto);
  }

  @Post(':id/publish')
  @Roles(UserRole.LEARNER)
  publish(@CurrentUser('id') learnerId: string, @Param('id') id: string) {
    return this.learnRequests.publish(learnerId, id);
  }

  @Post(':id/cancel')
  @Roles(UserRole.LEARNER)
  cancel(@CurrentUser('id') learnerId: string, @Param('id') id: string) {
    return this.learnRequests.cancel(learnerId, id);
  }

  @Delete(':id')
  @Roles(UserRole.LEARNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') learnerId: string, @Param('id') id: string) {
    return this.learnRequests.remove(learnerId, id);
  }
}
