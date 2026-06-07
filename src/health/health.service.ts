import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
}
@Injectable()
export class HealthService {
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '0.0.1',
    };
  }
}
