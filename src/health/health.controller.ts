import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthService, type HealthStatus } from './health.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthStatus> {
    return this.healthService.getHealth();
  }
}
