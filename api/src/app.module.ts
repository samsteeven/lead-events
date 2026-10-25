import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { KafkaModule } from './kafka/kafka.service';
import { PrismaModule } from './prisma/prisma.service';
import { PrivacyModule } from './privacy/privacy.controller';
import { StatsModule } from './stats/stats.controller';
import { WebhookModule } from './webhook/webhook.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule, KafkaModule, WebhookModule, StatsModule, PrivacyModule],
  controllers: [HealthController],
})
export class AppModule {}
