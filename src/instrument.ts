import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import 'dotenv/config';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Performance monitoring
  integrations: [nodeProfilingIntegration()],

  // 10% des transactions tracées (ajuster selon trafic)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Profiling (analyse perf)
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Release version (utile pour tracker)
  release: `learnmarket-backend@${process.env.npm_package_version || '0.0.1'}`,

  // Ignorer certaines erreurs courantes
  ignoreErrors: ['NotFoundException', 'ValidationError'],

  // Avant d'envoyer l'erreur
  beforeSend(event) {
    // Ne pas envoyer en local
    if (process.env.NODE_ENV === 'development') {
      return null;
    }

    // Ajouter context
    if (event.request) {
      // Cleanup sensitive data
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
    }

    return event;
  },
});
console.log(`✅ Sentry initialized (env: ${process.env.NODE_ENV})`);
