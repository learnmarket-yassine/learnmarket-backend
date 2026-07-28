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

// No role guard here -- the ownership check inside the service (proposal
// must belong to a learn request owned by this learner) is the actual
// security boundary. A tutor calling this never owns the parent request,
// so it 404s there naturally, same as a learner targeting someone else's
// proposal. A separate role check would only turn that into a 403 for one
// caller type while leaving the other case to fall through to the same 404.
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
