import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ShortlistedProposalsService } from '../services/shortlisted-proposals.service';

@Controller('proposals')
export class ShortlistedProposalsController {
  constructor(
    private readonly shortlistedProposals: ShortlistedProposalsService,
  ) {}

  @Post(':id/shortlist')
  @HttpCode(HttpStatus.CREATED)
  shortlist(@CurrentUser('id') learnerId: string, @Param('id') id: string) {
    return this.shortlistedProposals.shortlist(learnerId, id);
  }

  @Delete(':id/shortlist')
  @HttpCode(HttpStatus.NO_CONTENT)
  unshortlist(@CurrentUser('id') learnerId: string, @Param('id') id: string) {
    return this.shortlistedProposals.unshortlist(learnerId, id);
  }
}
