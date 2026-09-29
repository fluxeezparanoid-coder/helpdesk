import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './config/app';
import { seedIfEmpty } from './seed';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
  configureApp(app);
  setupSwagger(app);
  if (process.env.SEED_DEMO !== 'false') await seedIfEmpty(app);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Helpdesk API on http://localhost:${port}  (Swagger: /docs)`);
}

bootstrap();
