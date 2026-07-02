import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateSkillDto } from '../dto/skill/create-skill.dto';
import { SkillService } from '../services/skill.service';

@Controller('tutor/skills')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class SkillController {
  constructor(private readonly skill: SkillService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  add(@CurrentUser('id') userId: string, @Body() dto: CreateSkillDto) {
    return this.skill.add(userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser('id') userId: string, @Param('id') skillId: string) {
    return this.skill.remove(userId, skillId);
  }
}
