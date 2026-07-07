import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientConnectsException extends HttpException {
  constructor(required: number, balance: number) {
    const missing = required - balance;
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Insufficient Connects',
        message: `You need ${missing} more connect${missing === 1 ? '' : 's'} to submit this proposal (requires ${required}, you have ${balance}).`,
        required,
        balance,
        missing,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
