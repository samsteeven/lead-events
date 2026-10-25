import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, EachBatchPayload, Kafka, Producer } from 'kafkajs';
import { InvalidEventError, LeadEvent, parseLeadEvent } from '../events/lead-event';
import { createKafka, ensureTopics, Topics, topicsFrom } from '../kafka/kafka.service';
import { StatsAggregator } from './stats-aggregator.service';

export const DEFAULT_CONSUMER_GROUP = 'lead-stats';

/** Lit `lead.events` et alimente les statistiques. Les messages illisibles partent dans la file `lead.events.dlq`. */
@Injectable()
export class StatsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatsConsumerService.name);
  private readonly kafka: Kafka;
  private readonly topics: Topics;
  private readonly groupId: string;
  /** Nombre de partitions lues en parallèle par ce processus (1 = une à la fois). */
  private readonly concurrency: number;
  private readonly consumer: Consumer;
  private readonly dlq: Producer;

  constructor(
    config: ConfigService,
    private readonly aggregator: StatsAggregator,
  ) {
    this.topics = topicsFrom(config);
    this.groupId = config.get<string>('KAFKA_CONSUMER_GROUP') ?? DEFAULT_CONSUMER_GROUP;
    this.concurrency = Math.max(1, Number(config.get<string>('KAFKA_CONSUMER_CONCURRENCY') ?? 1));
    this.kafka = createKafka(config.getOrThrow<string>('KAFKA_BROKERS'), 'lead-events-consumer');
    this.consumer = this.kafka.consumer({ groupId: this.groupId, sessionTimeout: 15_000 });
    this.dlq = this.kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    await ensureTopics(this.kafka, this.topics);
    await Promise.all([this.consumer.connect(), this.dlq.connect()]);
    // Le conteneur redémarre si le consumer plante définitivement (politique `restart` de Docker).
    this.consumer.on(this.consumer.events.CRASH, ({ payload }) => {
      this.logger.error(`Consumer arrêté : ${payload.error.message}`);
      if (!payload.restart) process.exit(1);
    });
    await this.consumer.subscribe({ topic: this.topics.events, fromBeginning: true });
    await this.consumer.run({ partitionsConsumedConcurrently: this.concurrency, eachBatch: (payload) => this.handleBatch(payload) });
    this.logger.log(`Consumer « ${this.groupId} » abonné à ${this.topics.events}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
    await this.dlq.disconnect();
  }

  /**
   * Traite un lot de messages d'une partition en une seule transaction (voir StatsAggregator.applyBatch).
   * Si la transaction échoue, l'exception remonte : kafkajs ne valide pas les offsets et relit le lot ; le rejeu est
   * sans effet grâce à l'idempotence. Les messages illisibles sont écartés vers la file morte avant le calcul.
   */
  private async handleBatch({ batch, heartbeat }: EachBatchPayload): Promise<void> {
    const events: LeadEvent[] = [];
    for (const message of batch.messages) {
      const raw = message.value?.toString('utf8') ?? '';
      try {
        events.push(parseLeadEvent(raw));
      } catch (error) {
        if (!(error instanceof InvalidEventError)) throw error;
        // Message illisible : le rejouer ne servirait à rien, on le met de côté pour analyse.
        this.logger.warn(`Message invalide (partition ${batch.partition}) mis en file morte : ${error.message}`);
        await this.dlq.send({
          topic: this.topics.dlq,
          messages: [{ key: message.key, value: raw, headers: { error: error.message, partition: String(batch.partition) } }],
        });
      }
    }
    const { duplicates } = await this.aggregator.applyBatch(events);
    if (duplicates > 0) this.logger.debug(`${duplicates} doublon(s) ignoré(s) dans un lot de ${events.length}`);
    await heartbeat();
  }
}
