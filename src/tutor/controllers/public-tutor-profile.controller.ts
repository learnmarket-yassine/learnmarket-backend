import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { TutorProfileService } from '../services/tutor-profile.service';

@Controller('tutors/:id')
export class PublicTutorProfileController {
  constructor(private readonly tutorProfile: TutorProfileService) {}

  @Get()
  @Public()
  getPublicProfile(@Param('id') tutorId: string) {
    return this.tutorProfile.findPublicByUserId(tutorId);
  }
}
