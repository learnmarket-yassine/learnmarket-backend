import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { SparksModule } from '../sparks/sparks.module';
import { DailyModule } from '../sessions/daily.module';
import { StripeModule } from './stripe.module';
import { PaymentsService } from './services/payments.service';
import { PayoutsService } from './services/payouts.service';
import { PayoutsReconciliationCron } from './services/payouts-reconciliation.cron';
import { WebhookHandlerService } from './services/webhook-handler.service';
import { TutorConnectService } from './services/tutor-connect.service';
import { PaymentDisputesService } from './services/payment-disputes.service';
import { PaymentsGateway } from './gateways/payments.gateway';
import { PaymentsController } from './controllers/payments.controller';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import { AdminPaymentDisputesController } from './controllers/admin-payment-disputes.controller';
import { AdminTransactionsController } from './controllers/admin-transactions.controller';

@Module({
  imports: [
    ProposalsModule,
    AuthModule,
    StripeModule,
    SparksModule,
    DailyModule,
    NotificationsModule,
  ],
  providers: [
    PaymentsService,
    PayoutsService,
    PayoutsReconciliationCron,
    WebhookHandlerService,
    TutorConnectService,
    PaymentDisputesService,
    PaymentsGateway,
  ],
  controllers: [
    PaymentsController,
    StripeWebhookController,
    AdminPaymentDisputesController,
    AdminTransactionsController,
  ],
  exports: [PayoutsService, StripeModule],
})
export class PaymentsModule {}
