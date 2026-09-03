import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { DailyService } from '../services/daily.service';
import { SessionsService } from '../services/sessions.service';

@Controller('webhooks/daily')
export class DailyWebhookController {
  constructor(
    private readonly daily: DailyService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-timestamp') timestamp: string,
    @Headers('x-webhook-signature') signature: string,
  ) {
    if (
      !this.daily.verifyWebhookSignature(req.rawBody!, timestamp, signature)
    ) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = JSON.parse(req.rawBody!.toString('utf8')) as {
      type: string;
      payload: { room: string; user_id: string };
    };

    if (event.type === 'participant.joined') {
      await this.sessions.recordVerifiedJoin(
        event.payload.room,
        event.payload.user_id,
      );
    }

    return { received: true };
  }
}
