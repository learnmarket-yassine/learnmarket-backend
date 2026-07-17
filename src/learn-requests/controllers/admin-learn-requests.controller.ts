import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { LearnRequestsService } from '../services/learn-requests.service';
import { AdminListLearnRequestsQueryDto } from '../dto/admin-list-learn-requests-query.dto';

@Controller('admin/learn-requests')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLearnRequestsController {
  constructor(private readonly learnRequests: LearnRequestsService) {}

  @Get()
  findAll(@Query() query: AdminListLearnRequestsQueryDto) {
    return this.learnRequests.findAllForAdmin(query);
  }
}
