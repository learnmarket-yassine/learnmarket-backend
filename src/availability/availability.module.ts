import { Module } from '@nestjs/common';

import { AvailabilityGuardService } from './services/availability-guard.service';
import { AvailabilityResolverService } from './services/availability-resolver.service';
import { TutorAvailabilityExceptionsService } from './services/tutor-availability-exceptions.service';
import { TutorAvailabilityRulesService } from './services/tutor-availability-rules.service';

import { AvailableSlotsController } from './controllers/available-slots.controller';
import { TutorAvailabilityExceptionsController } from './controllers/tutor-availability-exceptions.controller';
import { TutorAvailabilityRulesController } from './controllers/tutor-availability-rules.controller';

@Module({
  providers: [
    AvailabilityGuardService,
    AvailabilityResolverService,
    TutorAvailabilityRulesService,
    TutorAvailabilityExceptionsService,
  ],
  controllers: [
    TutorAvailabilityRulesController,
    TutorAvailabilityExceptionsController,
    AvailableSlotsController,
  ],
  exports: [AvailabilityResolverService],
})
export class AvailabilityModule {}
