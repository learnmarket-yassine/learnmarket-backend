import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const ZOOM_OAUTH_URL = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE = 'https://api.zoom.us/v2';

const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000;

export interface ZoomMeeting {
  // Zoom's API returns this as a JSON number (e.g. 84912052310), not a
  // string -- callers persisting it must convert explicitly.
  id: number;
  join_url: string;
  start_url: string;
  password: string;
}

@Injectable()
export class ZoomService {
  private readonly logger = new Logger(ZoomService.name);
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.token;
    }

    const accountId = this.config.getOrThrow<string>('ZOOM_ACCOUNT_ID');
    const clientId = this.config.getOrThrow<string>('ZOOM_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('ZOOM_CLIENT_SECRET');
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64',
    );

    const response = await fetch(
      `${ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id=${accountId}`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${basicAuth}` },
      },
    );
    if (!response.ok) {
      throw new Error(
        `Zoom OAuth token request failed with status ${response.status}`,
      );
    }
    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.cachedToken = {
      token: body.access_token,
      expiresAt:
        Date.now() + body.expires_in * 1000 - TOKEN_EXPIRY_SAFETY_MARGIN_MS,
    };
    return this.cachedToken.token;
  }

  async createMeeting(
    topic: string,
    startTime: Date,
    durationMinutes: number,
  ): Promise<ZoomMeeting> {
    const token = await this.getAccessToken();
    const response = await fetch(`${ZOOM_API_BASE}/users/me/meetings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic,
        type: 2, // scheduled meeting
        start_time: startTime.toISOString(),
        duration: durationMinutes,
        settings: {
          join_before_host: false,
          waiting_room: true,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Zoom create-meeting request failed with status ${response.status}`,
      );
    }
    return (await response.json()) as ZoomMeeting;
  }

  async deleteMeeting(zoomMeetingId: string): Promise<void> {
    try {
      const token = await this.getAccessToken();
      const response = await fetch(
        `${ZOOM_API_BASE}/meetings/${zoomMeetingId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      // 404 is expected if the meeting was already removed from the Zoom
      // dashboard -- not a failure from this caller's perspective.
      if (!response.ok && response.status !== 404) {
        throw new Error(
          `Zoom delete-meeting request failed with status ${response.status}`,
        );
      }
    } catch (err) {
      this.logger.error('Zoom meeting deletion failed', err);
    }
  }
}
