import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // Bull Board admin UI — gated by ADMIN_TOKEN header
  const redisConn = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
  const bullBoardAdapter = new ExpressAdapter();
  bullBoardAdapter.setBasePath('/admin/queues');
  createBullBoard({
    queues: [
      new BullMQAdapter(new Queue('discovery-queue', { connection: redisConn })),
      new BullMQAdapter(new Queue('apply-queue', { connection: redisConn })),
      new BullMQAdapter(new Queue('comms-queue', { connection: redisConn })),
    ],
    serverAdapter: bullBoardAdapter,
  });

  const adminToken = process.env.ADMIN_TOKEN;
  app.use('/admin/queues', (req: { headers: Record<string, string> }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (adminToken && req.headers['x-admin-token'] !== adminToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
  });
  app.use('/admin/queues', bullBoardAdapter.getRouter());

  const config = new DocumentBuilder()
    .setTitle('PitchFire API')
    .setDescription('Autonomous job search orchestrator API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`PitchFire API running on http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
}

bootstrap();
