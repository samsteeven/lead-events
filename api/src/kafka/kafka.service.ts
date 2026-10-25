import { Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, logLevel, Producer } from 'kafkajs';
import { LeadEvent } from '../events/lead-event';

export const DEFAULT_TOPIC = 'lead.events';
const PARTITIONS = 3;

export interface Topics {
  events: string;
  dlq: string;
}

export function topicsFrom(config: ConfigService): Topics {
  const events = config.get<string>('KAFKA_TOPIC') ?? DEFAULT_TOPIC;
  return { events, dlq: `${events}.dlq` };
}

export function createKafka(brokers: string, clientId: string): Kafka {
  return new Kafka({
    clientId,
    brokers: brokers.split(',').map((b) => b.trim()),
    logLevel: logLevel.WARN,
    retry: { initialRetryTime: 200, retries: 8 },
  });
}

/** Crée les topics manquants (la création automatique est désactivée sur le broker). */
export async function ensureTopics(kafka: Kafka, topics: Topics): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const existing = new Set(await admin.listTopics());
    const wanted = [
      { topic: topics.events, numPartitions: PARTITIONS, replicationFactor: 1 },
      { topic: topics.dlq, numPartitions: 1, replicationFactor: 1 },
    ];
    const missing = wanted.filter((t) => !existing.has(t.topic));
    // L'API et le consumer démarrent en même temps : si l'autre a créé le topic entre-temps, createTopics renvoie simplement false.
    if (missing.length > 0) await admin.createTopics({ waitForLeaders: true, topics: missing });
  } finally {
    await admin.disconnect();
  }
}

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private readonly kafka: Kafka;
  private readonly topics: Topics;
  private producer: Producer;

  constructor(config: ConfigService) {
    this.topics = topicsFrom(config);
    this.kafka = createKafka(config.getOrThrow<string>('KAFKA_BROKERS'), 'lead-events-api');
    // Producteur idempotent : un renvoi interne du client ne crée pas de doublon dans le topic.
    this.producer = this.kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
  }

  async onModuleInit(): Promise<void> {
    await ensureTopics(this.kafka, this.topics);
    await this.producer.connect();
    this.logger.log(`Producteur Kafka prêt (topic ${this.topics.events})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  /** Publie un événement ; la clé est le lead, donc l'ordre des événements d'un même lead est conservé. */
  async publish(event: LeadEvent): Promise<void> {
    await this.producer.send({
      topic: this.topics.events,
      acks: -1,
      messages: [{ key: event.leadId, value: JSON.stringify(event), headers: { 'event-type': event.type } }],
    });
  }
}

@Module({ providers: [KafkaProducerService], exports: [KafkaProducerService] })
export class KafkaModule {}
