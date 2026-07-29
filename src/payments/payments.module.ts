import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { StripeService } from './services/stripe.service';
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

@Module({
  imports: [ProposalsModule, AuthModule],
  providers: [
    StripeService,
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
  ],
  exports: [PayoutsService, StripeService],
})
export class PaymentsModule {}
