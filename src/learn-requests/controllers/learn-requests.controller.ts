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
import { SavedLearnRequestsService } from '../services/saved-learn-requests.service';
import { CreateLearnRequestDraftDto } from '../dto/create-draft.dto';
import { UpdateLearnRequestDto } from '../dto/update-learn-request.dto';
import { GetLearnRequestsQueryDto } from '../dto/list-learn-requests-query.dto';
import { ListSavedLearnRequestsQueryDto } from '../dto/list-saved-learn-requests-query.dto';
import { GetProposalsForRequestQueryDto } from '../dto/get-proposals-for-request-query.dto';

@Controller('learn-requests')
@UseGuards(RolesGuard)
export class LearnRequestsController {
  constructor(
    private readonly learnRequests: LearnRequestsService,
    private readonly savedLearnRequests: SavedLearnRequestsService,
  ) {}

  @Post('draft')
  @Roles(UserRole.LEARNER)
  @HttpCode(HttpStatus.CREATED)
  createDraft(
    @CurrentUser('id') learnerId: string,
    @Body() dto: CreateLearnRequestDraftDto,
  ) {
    return this.learnRequests.createDraft(learnerId, dto);
  }

  @Get()
  findMany(
    @CurrentUser() user: AuthUser,
    @Query() query: GetLearnRequestsQueryDto,
  ) {
    return this.learnRequests.findMany(user, query);
  }

  // Must be declared before @Get(':id') below -- Nest/Express match routes
  // in registration order, so "saved" would otherwise be captured as the
  // :id param and 404 through findOneDetail instead of hitting this route.
  @Get('saved')
  @Roles(UserRole.TUTOR)
  listSaved(
    @CurrentUser() user: AuthUser,
    @Query() query: ListSavedLearnRequestsQueryDto,
  ) {
    return this.savedLearnRequests.listSaved(user, query.page, query.take);
  }

  @Get(':id')
  findOne(@CurrentUser() viewer: AuthUser, @Param('id') id: string) {
    return this.learnRequests.findOneDetail(viewer, id);
  }

  @Get(':id/proposals')
  findProposalsForRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: GetProposalsForRequestQueryDto,
  ) {
    return this.learnRequests.findProposalsForRequest(user, id, query);
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
