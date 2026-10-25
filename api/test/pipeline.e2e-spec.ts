/**
 * Pipeline complet contre une vraie infrastructure : webhook signé -> PostgreSQL -> Kafka -> consumer -> statistiques.
 * Prérequis : `docker compose up -d postgres kafka` et api/.env renseigné (voir README).
 * Chaque exécution utilise son propre topic et son propre groupe de consumer : aucun message d'une exécution
 * précédente ne peut fausser les compteurs.
 */
import { INestApplication, INestApplicationContext, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Kafka, logLevel } from 'kafkajs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { StatsAggregator } from '../src/consumer/stats-aggregator.service';
import { ConsumerModule } from '../src/consumer/consumer.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { signatureHeader } from '../src/webhook/signature';

const RUN = randomUUID().slice(0, 8);
process.env.KAFKA_TOPIC = `lead.events.test.${RUN}`;
process.env.KAFKA_CONSUMER_GROUP = `lead-stats-test-${RUN}`;

type EventType = 'lead.received' | 'lead.scored' | 'email.sent';

describe('pipeline webhook -> Kafka -> consumer -> statistiques', () => {
  let app: INestApplication;
  let consumer: INestApplicationContext;
  let prisma: PrismaService;
  let secret: string;
  let token: string;

  const body = (type: EventType, lead: string, extra: Record<string, unknown> = {}) => ({
    type,
    idempotencyKey: `${RUN}-${lead}:${type}`,
    occurredAt: new Date().toISOString(),
    lead: { externalId: `${RUN}-${lead}`, email: `${lead}@example.test`, company: 'Acme', source: 'contact-form' },
    ...extra,
  });

  /** Envoie l'événement avec une signature valide ; `raw` permet de signer un corps précis. */
  const send = (payload: unknown) => {
    const raw = JSON.stringify(payload);
    return request(app.getHttpServer())
      .post('/webhooks/n8n')
      .set('content-type', 'application/json')
      .set('x-lead-signature', signatureHeader(secret, raw))
      .send(raw);
  };

  const waitFor = async (predicate: () => Promise<boolean>, what: string, timeoutMs = 20_000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await predicate()) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`Délai dépassé en attendant : ${what}`);
  };
  const processed = () => prisma.processedEvent.count({ where: { eventId: { startsWith: RUN } } });
  const summary = () => request(app.getHttpServer()).get('/stats/summary').set('authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true, logger: ['error'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    consumer = await NestFactory.createApplicationContext(ConsumerModule, { logger: ['error', 'warn'] });

    prisma = app.get(PrismaService);
    secret = process.env.WEBHOOK_SECRET!;
    token = process.env.DASHBOARD_TOKEN!;
    // Repart d'une base vide : les assertions portent sur des compteurs exacts.
    await prisma.$transaction([
      prisma.processedEvent.deleteMany(),
      prisma.dailyStats.deleteMany(),
      prisma.scoreBucket.deleteMany(),
      prisma.webhookDelivery.deleteMany(),
      prisma.lead.deleteMany(),
    ]);
  });

  afterAll(async () => {
    await consumer?.close();
    await app?.close();
  });

  describe('sécurité du webhook', () => {
    it('refuse un appel sans signature', async () => {
      await request(app.getHttpServer()).post('/webhooks/n8n').send(body('lead.received', 'x')).expect(401);
    });

    it('refuse une signature calculée avec un autre secret', async () => {
      const raw = JSON.stringify(body('lead.received', 'x'));
      await request(app.getHttpServer())
        .post('/webhooks/n8n')
        .set('content-type', 'application/json')
        .set('x-lead-signature', signatureHeader('un-autre-secret-bien-long', raw))
        .send(raw)
        .expect(401);
    });

    it('refuse un appel rejoué hors de la fenêtre de tolérance', async () => {
      const raw = JSON.stringify(body('lead.received', 'x'));
      const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
      await request(app.getHttpServer())
        .post('/webhooks/n8n')
        .set('content-type', 'application/json')
        .set('x-lead-signature', signatureHeader(secret, raw, tenMinutesAgo))
        .send(raw)
        .expect(401);
    });

    it('refuse un corps invalide, même correctement signé (400)', async () => {
      await send({ ...body('lead.scored', 'bad'), score: 42 }).expect(400);
      await send({ ...body('lead.received', 'bad'), lead: { externalId: 'x', email: 'pas-un-email' } }).expect(400);
      await send({ type: 'lead.deleted' }).expect(400);
    });

    it('n\'écrit rien pour un appel refusé', async () => {
      expect(await prisma.lead.count({ where: { externalId: { startsWith: RUN } } })).toBe(0);
    });
  });

  describe('parcours d\'un lead', () => {
    it('suit les trois étapes et alimente les statistiques', async () => {
      const r1 = await send(body('lead.received', 'alice')).expect(202);
      expect(r1.body).toMatchObject({ duplicate: false, eventId: `${RUN}-alice:lead.received` });
      await send(body('lead.scored', 'alice', { score: 8, scoreReason: 'budget confirmé, besoin urgent' })).expect(202);
      await send(body('email.sent', 'alice')).expect(202);

      await waitFor(async () => (await processed()) === 3, '3 événements consommés');

      const lead = await prisma.lead.findUniqueOrThrow({ where: { externalId: `${RUN}-alice` } });
      expect(lead).toMatchObject({ status: 'EMAILED', score: 8, scoreReason: 'budget confirmé, besoin urgent' });
      expect(lead.scoredAt).not.toBeNull();
      expect(lead.emailSentAt).not.toBeNull();

      const stats = (await summary().expect(200)).body;
      expect(stats).toMatchObject({ received: 1, scored: 1, emailed: 1, avgScore: 8, emailRate: 100 });
      expect(stats.latencyAllTime.count).toBe(3);
      expect(stats.latencyAllTime.p95).toBeGreaterThanOrEqual(0);
      expect(stats.latencyAllTime.p95).toBeLessThan(5_000);
    });

    it('absorbe un rejeu de n8n : même clé d\'idempotence, un seul comptage', async () => {
      const replay = await send(body('lead.scored', 'alice', { score: 8 })).expect(202);
      expect(replay.body.duplicate).toBe(true);
      await new Promise((r) => setTimeout(r, 1_500)); // laisse au consumer le temps de (ne pas) compter
      expect(await processed()).toBe(3);
      expect((await summary()).body).toMatchObject({ received: 1, scored: 1, emailed: 1 });
    });

    it('ne fait jamais reculer un lead quand les événements arrivent dans le désordre', async () => {
      await send(body('email.sent', 'bruno')).expect(202);
      await send(body('lead.received', 'bruno')).expect(202);
      await waitFor(async () => (await processed()) === 5, 'événements de bruno consommés');
      const lead = await prisma.lead.findUniqueOrThrow({ where: { externalId: `${RUN}-bruno` } });
      expect(lead.status).toBe('EMAILED');
    });
  });

  describe('consumer', () => {
    it("compte un lot contenant des doublons : chaque événement une seule fois, dans le lot comme entre deux lots", async () => {
      const aggregator = consumer.get(StatsAggregator);
      const leadId = (await prisma.lead.findFirstOrThrow({ where: { externalId: `${RUN}-alice` } })).id;
      const mk = (suffix: string, type: EventType, score?: number) => ({
        eventId: `${RUN}-lot:${suffix}`,
        type,
        leadId,
        externalId: `${RUN}-alice`,
        occurredAt: new Date().toISOString(),
        webhookAt: new Date().toISOString(),
        ...(score ? { score } : {}),
      });
      const batch = [mk('a', 'lead.received'), mk('b', 'lead.scored', 10), mk('a', 'lead.received'), mk('c', 'email.sent')];

      expect(await aggregator.applyBatch(batch)).toEqual({ applied: 3, duplicates: 1 });
      expect(await aggregator.applyBatch(batch)).toEqual({ applied: 0, duplicates: 4 });
      expect(await aggregator.applyBatch([])).toEqual({ applied: 0, duplicates: 0 });

      const { body: scores } = await request(app.getHttpServer()).get('/stats/scores').set('authorization', `Bearer ${token}`);
      expect(scores.find((s: { score: number }) => s.score === 10).count).toBe(1); // compté une seule fois
    });

    it('ne compte pas deux fois un événement livré deux fois par Kafka', async () => {
      const aggregator = consumer.get(StatsAggregator);
      const event = {
        eventId: `${RUN}-direct:lead.received`,
        type: 'lead.received' as const,
        leadId: (await prisma.lead.findFirstOrThrow({ where: { externalId: `${RUN}-alice` } })).id,
        externalId: `${RUN}-alice`,
        occurredAt: new Date().toISOString(),
        webhookAt: new Date().toISOString(),
      };
      expect(await aggregator.apply(event)).toBe('applied');
      expect(await aggregator.apply(event)).toBe('duplicate');
    });

    it('met un message illisible en file morte sans s\'arrêter', async () => {
      const kafka = new Kafka({ brokers: process.env.KAFKA_BROKERS!.split(','), logLevel: logLevel.NOTHING });
      const producer = kafka.producer();
      await producer.connect();
      await producer.send({ topic: process.env.KAFKA_TOPIC!, messages: [{ key: 'poison', value: 'ceci n\'est pas du json' }] });
      await producer.disconnect();

      const dlqConsumer = kafka.consumer({ groupId: `dlq-${RUN}` });
      await dlqConsumer.connect();
      await dlqConsumer.subscribe({ topic: `${process.env.KAFKA_TOPIC}.dlq`, fromBeginning: true });
      const received: string[] = [];
      await dlqConsumer.run({ eachMessage: async ({ message }) => void received.push(message.value!.toString()) });
      await waitFor(async () => received.length === 1, 'message en file morte');
      await dlqConsumer.disconnect();
      expect(received[0]).toBe('ceci n\'est pas du json');

      // Le consumer a continué : l'événement suivant est bien compté.
      const before = await processed();
      await send(body('lead.received', 'chloe')).expect(202);
      await waitFor(async () => (await processed()) === before + 1, 'événement suivant consommé');
    });
  });

  describe('API de lecture', () => {
    it.each(['/stats/summary', '/stats/daily', '/stats/scores', '/stats/latency', '/leads'])('%s exige le jeton', async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer()).get(path).set('authorization', 'Bearer mauvais-jeton').expect(401);
      await request(app.getHttpServer()).get(path).set('authorization', `Bearer ${token}`).expect(200);
    });

    it('masque les adresses e-mail dans la liste des leads', async () => {
      const { body: leads } = await request(app.getHttpServer()).get('/leads').set('authorization', `Bearer ${token}`).expect(200);
      expect(leads.length).toBeGreaterThanOrEqual(3);
      for (const lead of leads) expect(lead.email).toMatch(/^.\*\*\*@example\.test$/);
    });

    it('répartit les scores de 1 à 10', async () => {
      const { body: scores } = await request(app.getHttpServer()).get('/stats/scores').set('authorization', `Bearer ${token}`).expect(200);
      expect(scores).toHaveLength(10);
      expect(scores.find((s: { score: number }) => s.score === 8).count).toBe(1);
    });

    it('expose la santé sans jeton', async () => {
      await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
    });
  });
});
