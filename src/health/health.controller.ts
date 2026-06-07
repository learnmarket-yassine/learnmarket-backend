import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthService, type HealthStatus } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthStatus> {
    return this.healthService.getHealth();
  }
}
