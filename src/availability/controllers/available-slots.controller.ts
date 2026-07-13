import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryAvailableSlotsDto } from '../dto/query-available-slots.dto';
import { AvailabilityResolverService } from '../services/availability-resolver.service';

@Controller('tutors/:tutorId/available-slots')
export class AvailableSlotsController {
  constructor(private readonly resolver: AvailabilityResolverService) {}

  @Get()
  async findAvailableSlots(
    @Param('tutorId') tutorId: string,
    @Query() query: QueryAvailableSlotsDto,
  ) {
    const slots = await this.resolver.resolveAvailableSlots(
      tutorId,
      query.fromDate,
      query.toDate,
      query.durationMinutes,
    );
    return { slots };
  }
}
