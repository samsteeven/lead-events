import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConsumerModule } from './consumer/consumer.module';

/** Point d'entrée du consumer (processus séparé de l'API) : `node dist/consumer.js`. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(ConsumerModule);
  app.enableShutdownHooks();
  new Logger('Consumer').log('Consumer démarré');
}

void bootstrap();
