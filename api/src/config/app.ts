import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

/** Shared by main.ts and the e2e tests so the tests exercise the real pipeline. */
export function configureApp(app: INestApplication): void {
  // Strict CSP everywhere except the Swagger UI, which needs inline scripts to render.
  const strict = helmet();
  const relaxed = helmet({ contentSecurityPolicy: false });
  app.use((req: { path: string }, res: unknown, next: () => void) => ((req.path.startsWith('/docs') ? relaxed : strict) as any)(req, res, next));
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties (mass-assignment guard)
      forbidNonWhitelisted: true, // ...and reject the request instead of ignoring them silently
      transform: true,
    }),
  );
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Helpdesk API')
    .setDescription(
      'Support ticket system. Customers open tickets, agents work a queue with SLA timers, admins manage users and read the audit log.\n\n' +
        'Use `POST /auth/login`, copy the `accessToken`, press **Authorize**.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
