import { Test, TestingModule } from '@nestjs/testing';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { StripeService } from '../services/stripe.service';
import { WebhookHandlerService } from '../services/webhook-handler.service';
import { StripeWebhookController } from './stripe-webhook.controller';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let stripe: { constructWebhookEvent: jest.Mock };
  let webhookHandler: { handle: jest.Mock };

  beforeEach(async () => {
    stripe = { constructWebhookEvent: jest.fn() };
    webhookHandler = { handle: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: StripeService, useValue: stripe },
        { provide: WebhookHandlerService, useValue: webhookHandler },
      ],
    }).compile();

    controller = moduleRef.get(StripeWebhookController);
  });

  it('never reaches the handler when signature verification throws -- an invalid/missing signature must not be caught and swallowed', async () => {
    stripe.constructWebhookEvent.mockImplementation(() => {
      throw new Error('Webhook signature verification failed');
    });
    const req = { rawBody: Buffer.from('{}') } as RawBodyRequest<Request>;

    await expect(controller.handle(req, 'bad-signature')).rejects.toThrow(
      'Webhook signature verification failed',
    );
    expect(webhookHandler.handle).not.toHaveBeenCalled();
  });

  it('delegates the verified event straight to the handler on a valid signature', async () => {
    const event = { id: 'evt_1', type: 'payment_intent.succeeded' };
    stripe.constructWebhookEvent.mockReturnValue(event);
    webhookHandler.handle.mockResolvedValue({ received: true });
    const req = { rawBody: Buffer.from('{}') } as RawBodyRequest<Request>;

    const result = await controller.handle(req, 'good-signature');

    expect(webhookHandler.handle).toHaveBeenCalledWith(event);
    expect(result).toEqual({ received: true });
  });
});
