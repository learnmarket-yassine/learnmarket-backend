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
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateRuleDto } from '../dto/rules/create-rule.dto';
import { UpdateRuleDto } from '../dto/rules/update-rule.dto';
import { UpdateRulesDiffDto } from '../dto/rules/update-rules-diff.dto';
import { TutorAvailabilityRulesService } from '../services/tutor-availability-rules.service';

@Controller('tutor/availability/rules')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class TutorAvailabilityRulesController {
  constructor(private readonly rules: TutorAvailabilityRulesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('id') tutorId: string, @Body() dto: CreateRuleDto) {
    return this.rules.create(tutorId, dto);
  }

  @Get()
  findAll(@CurrentUser('id') tutorId: string) {
    return this.rules.findAll(tutorId);
  }

  @Put()
  applyDiff(
    @CurrentUser('id') tutorId: string,
    @Body() dto: UpdateRulesDiffDto,
  ) {
    return this.rules.applyDiff(tutorId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') tutorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
  ) {
    return this.rules.update(tutorId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') tutorId: string, @Param('id') id: string) {
    return this.rules.remove(tutorId, id);
  }
}
