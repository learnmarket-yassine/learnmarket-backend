import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  message: string;
  checks: {
    database: 'ok' | 'down';
  };
}
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  constructor(private readonly prisma: PrismaService) {}
  async getHealth(): Promise<HealthStatus> {
    const databaseStatus = await this.checkDatabase();

    const overallStatus: HealthStatus['status'] =
      databaseStatus === 'ok' ? 'ok' : 'degraded';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      message: 'LearnMarket API - Auto Deploy Test!',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '0.0.1',
      checks: {
        database: databaseStatus,
      },
    };
  }
  private async checkDatabase(): Promise<'ok' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch (error) {
      this.logger.error('Database healthcheck failed', error);
      return 'down';
    }
  }
}
