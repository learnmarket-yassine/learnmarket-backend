import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const DAILY_API_BASE = 'https://api.daily.co/v1';

export interface DailyRoom {
  name: string;
  url: string;
}

export interface CreateMeetingTokenParams {
  roomName: string;
  userId: string;
  userName: string;
  isOwner: boolean;
  expiresAt: Date;
}

function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

@Injectable()
export class DailyService {
  constructor(private readonly config: ConfigService) {}

  private authHeaders() {
    const apiKey = this.config.getOrThrow<string>('DAILY_API_KEY');
    return {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async createRoom(roomName: string, expiresAt: Date): Promise<DailyRoom> {
    const response = await fetch(`${DAILY_API_BASE}/rooms`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({
        name: roomName,
        privacy: 'private',
        properties: { exp: unixSeconds(expiresAt), enable_recording: false },
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Daily create-room request failed with status ${response.status}`,
      );
    }
    return (await response.json()) as DailyRoom;
  }

  async updateRoomExpiry(roomName: string, expiresAt: Date): Promise<void> {
    const response = await fetch(
      `${DAILY_API_BASE}/rooms/${encodeURIComponent(roomName)}`,
      {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({
          properties: { exp: unixSeconds(expiresAt) },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Daily update-room request failed with status ${response.status}`,
      );
    }
  }

  async deleteRoom(roomName: string): Promise<void> {
    const response = await fetch(
      `${DAILY_API_BASE}/rooms/${encodeURIComponent(roomName)}`,
      { method: 'DELETE', headers: this.authHeaders() },
    );
    // A room that's already gone is not a failure -- deleteRoom is called
    // from decoupled cleanup paths that must never throw on "already deleted".
    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Daily delete-room request failed with status ${response.status}`,
      );
    }
  }

  async createMeetingToken(params: CreateMeetingTokenParams): Promise<string> {
    const response = await fetch(`${DAILY_API_BASE}/meeting-tokens`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({
        properties: {
          room_name: params.roomName,
          user_id: params.userId,
          user_name: params.userName,
          // is_owner is computed strictly server-side by the caller from the
          // requester's real participant role -- never accept this as a
          // client-supplied hint.
          is_owner: params.isOwner,
          exp: unixSeconds(params.expiresAt),
        },
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Daily create-meeting-token request failed with status ${response.status}`,
      );
    }
    const body = (await response.json()) as { token: string };
    return body.token;
  }

  /**
   * Daily signs webhooks as HMAC-SHA256(base64-decode(secret), `${timestamp}.${rawBody}`),
   * base64-encoded, delivered in the X-Webhook-Signature header. Verifying
   * against the raw request bytes (not a JSON.parse/re-stringify round trip)
   * is required -- re-serializing isn't guaranteed byte-identical to what
   * Daily actually signed.
   */
  verifyWebhookSignature(
    rawBody: Buffer,
    timestamp: string,
    signature: string,
  ): boolean {
    if (!timestamp || !signature) return false;

    const secret = this.config.getOrThrow<string>('DAILY_WEBHOOK_SECRET');
    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = crypto
      .createHmac('sha256', Buffer.from(secret, 'base64'))
      .update(signedPayload)
      .digest('base64');

    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== actualBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  }
}
