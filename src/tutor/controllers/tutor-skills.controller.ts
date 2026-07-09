import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AttachSkillDto } from '../dto/skill/attach-skill.dto';
import { ReplaceSkillsDto } from '../dto/skill/replace-skills.dto';
import { TutorSkillsService } from '../services/tutor-skills.service';

@Controller('tutor/skills')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class TutorSkillsController {
  constructor(private readonly tutorSkills: TutorSkillsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  attach(@CurrentUser('id') userId: string, @Body() dto: AttachSkillDto) {
    return this.tutorSkills.attach(userId, dto.skillId);
  }

  @Put()
  replace(@CurrentUser('id') userId: string, @Body() dto: ReplaceSkillsDto) {
    return this.tutorSkills.replace(userId, dto.skillIds);
  }

  @Delete(':skillId')
  @HttpCode(HttpStatus.NO_CONTENT)
  detach(@CurrentUser('id') userId: string, @Param('skillId') skillId: string) {
    return this.tutorSkills.detach(userId, skillId);
  }
}
