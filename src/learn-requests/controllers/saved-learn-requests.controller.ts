import {
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
import { SavedLearnRequestsService } from '../services/saved-learn-requests.service';

// GET /learn-requests/saved lives on LearnRequestsController instead of here
// (see the comment above its `listSaved` method) -- it needs to be
// registered ahead of that controller's GET /learn-requests/:id, and the
// safest way to guarantee that is same-controller, declared first, rather
// than relying on module `controllers` array order.
@Controller('learn-requests')
@UseGuards(RolesGuard)
@Roles(UserRole.TUTOR)
export class SavedLearnRequestsController {
  constructor(private readonly savedLearnRequests: SavedLearnRequestsService) {}

  @Post(':id/save')
  @HttpCode(HttpStatus.CREATED)
  save(@CurrentUser('id') tutorId: string, @Param('id') id: string) {
    return this.savedLearnRequests.save(tutorId, id);
  }

  @Delete(':id/save')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsave(@CurrentUser('id') tutorId: string, @Param('id') id: string) {
    return this.savedLearnRequests.unsave(tutorId, id);
  }
}
