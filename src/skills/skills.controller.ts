import { Controller, Get, Query } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { ListSkillsQueryDto } from './dto/list-skills-query.dto';

@Controller('skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  search(@Query() query: ListSkillsQueryDto) {
    return this.skills.search(query.search);
  }
}
