import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdatePlatformSettingsDto } from '../dto/update-platform-settings.dto';

const SETTINGS_ID = 'singleton';
const CACHE_TTL_MS = 30_000;

export interface PlatformSettingsValues {
  proposalSparksCost: number;
  serviceFeePercent: Prisma.Decimal;
}

@Injectable()
export class PlatformSettingsService {
  // Read on every proposal creation and fee calculation, so a DB round trip
  // per read would be wasteful for a value that only an admin ever changes.
  // A short TTL (rather than invalidate-on-write only) means other app
  // instances behind a load balancer pick up an admin's change on their own
  // within CACHE_TTL_MS, without needing any cross-instance invalidation.
  private cached: { value: PlatformSettingsValues; expiresAt: number } | null =
    null;

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<PlatformSettingsValues> {
    if (this.cached && Date.now() < this.cached.expiresAt) {
      return this.cached.value;
    }
    const row = await this.prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
    return this.cacheAndReturn(row);
  }

  async updateSettings(
    dto: UpdatePlatformSettingsDto,
  ): Promise<PlatformSettingsValues> {
    const data: { proposalSparksCost?: number; serviceFeePercent?: number } =
      {};
    if (dto.proposalSparksCost !== undefined) {
      data.proposalSparksCost = dto.proposalSparksCost;
    }
    if (dto.serviceFeePercent !== undefined) {
      data.serviceFeePercent = dto.serviceFeePercent;
    }
    const row = await this.prisma.platformSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...data },
    });
    return this.cacheAndReturn(row);
  }

  private cacheAndReturn(row: {
    proposalSparksCost: number;
    serviceFeePercent: Prisma.Decimal;
  }): PlatformSettingsValues {
    const value: PlatformSettingsValues = {
      proposalSparksCost: row.proposalSparksCost,
      serviceFeePercent: row.serviceFeePercent,
    };
    this.cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }
}
