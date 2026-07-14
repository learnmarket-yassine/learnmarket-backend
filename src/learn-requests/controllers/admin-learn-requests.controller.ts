import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { LearnRequestsService } from '../services/learn-requests.service';
import { AdminListLearnRequestsQueryDto } from '../dto/admin-list-learn-requests-query.dto';
import { RejectLearnRequestDto } from '../dto/reject-learn-request.dto';

@Controller('admin/learn-requests')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLearnRequestsController {
  constructor(private readonly learnRequests: LearnRequestsService) {}

  @Get()
  findAll(@Query() query: AdminListLearnRequestsQueryDto) {
    return this.learnRequests.findAllForAdmin(query);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.learnRequests.approve(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectLearnRequestDto) {
    return this.learnRequests.reject(id, dto.reason);
  }
}
