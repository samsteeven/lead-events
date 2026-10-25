import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../config/env';
import { PrismaModule } from '../prisma/prisma.service';
import { StatsAggregator } from './stats-aggregator.service';
import { StatsConsumerService } from './stats-consumer.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule],
  providers: [StatsAggregator, StatsConsumerService],
  exports: [StatsAggregator, StatsConsumerService],
})
export class ConsumerModule {}
