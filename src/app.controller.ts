import { Controller, Get } from '@nestjs/common';

@Controller('')
export class AppController {
  @Get('debug-sentry')
  debugSentry() {
    throw new Error('This is a test error for Sentry!');
  }
}
