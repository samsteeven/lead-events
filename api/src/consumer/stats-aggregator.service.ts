import { Injectable } from '@nestjs/common';
import { LeadEvent } from '../events/lead-event';
import { PrismaService } from '../prisma/prisma.service';

export type ApplyOutcome = 'applied' | 'duplicate';

export interface BatchOutcome {
  applied: number;
  duplicates: number;
}

/** Jour UTC (AAAA-MM-JJ) d'un instant ISO : les statistiques journalières sont comptées en UTC. */
export function utcDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Instant ISO converti au format attendu par `::timestamp` (UTC, sans fuseau), celui des colonnes Prisma. */
function pgTimestamp(value: string | Date): string {
  return new Date(value).toISOString().replace('T', ' ').replace('Z', '');
}

export interface DayDelta {
  day: string;
  received: number;
  scored: number;
  emailed: number;
  scoreSum: number;
}

export interface ScoreDelta {
  score: number;
  count: number;
}

/**
 * Regroupe des événements en variations de compteurs : une ligne par jour et une par score, quel que soit leur nombre.
 * Les lignes sont triées : deux consumers qui mettent à jour les mêmes lignes les verrouillent dans le même ordre,
 * ce qui exclut les interblocages.
 */
export function aggregate(events: LeadEvent[]): { days: DayDelta[]; scores: ScoreDelta[] } {
  const days = new Map<string, DayDelta>();
  const scores = new Map<number, number>();
  for (const event of events) {
    const day = utcDay(event.occurredAt);
    const delta = days.get(day) ?? { day, received: 0, scored: 0, emailed: 0, scoreSum: 0 };
    if (event.type === 'lead.received') delta.received++;
    if (event.type === 'email.sent') delta.emailed++;
    if (event.type === 'lead.scored' && event.score !== undefined) {
      delta.scored++;
      delta.scoreSum += event.score;
      scores.set(event.score, (scores.get(event.score) ?? 0) + 1);
    }
    days.set(day, delta);
  }
  return {
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    scores: [...scores.entries()].map(([score, count]) => ({ score, count })).sort((a, b) => a.score - b.score),
  };
}

@Injectable()
export class StatsAggregator {
  constructor(private readonly prisma: PrismaService) {}

  /** Un seul événement : cas particulier d'un lot (utilisé par les tests). */
  async apply(event: LeadEvent, consumedAt: Date = new Date()): Promise<ApplyOutcome> {
    const { applied } = await this.applyBatch([event], consumedAt);
    return applied === 1 ? 'applied' : 'duplicate';
  }

  /**
   * Compte un lot d'événements, chacun une seule fois. Kafka livre « au moins une fois » : un message peut arriver
   * deux fois (redémarrage du consumer, nouvel essai du producteur, même événement dans deux lots).
   * Tout se fait dans une transaction, en trois requêtes quelle que soit la taille du lot :
   *  1. insertion multi-lignes dans `processed_events` (clé = identifiant de l'événement, `ON CONFLICT DO NOTHING`) :
   *     `RETURNING` indique quels événements étaient vraiment nouveaux ;
   *  2. compteurs journaliers, 3. répartition des scores : variations agrégées des seuls événements nouveaux,
   *     ajoutées par `INSERT ... ON CONFLICT DO UPDATE` (atomique même avec plusieurs consumers).
   * Si la transaction échoue, rien n'est compté et le lot sera relu : le rejeu est sans effet.
   */
  async applyBatch(events: LeadEvent[], consumedAt: Date = new Date()): Promise<BatchOutcome> {
    // Un même événement peut apparaître deux fois dans le lot : on ne garde que le premier.
    const unique = [...new Map(events.map((e) => [e.eventId, e])).values()];
    if (unique.length === 0) return { applied: 0, duplicates: 0 };

    const consumed = pgTimestamp(consumedAt);
    const latency = (e: LeadEvent) => Math.max(0, consumedAt.getTime() - new Date(e.webhookAt).getTime());

    const applied = await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<{ eventId: string }[]>`
        INSERT INTO processed_events ("eventId", "type", "leadId", "webhookAt", "consumedAt", "latencyMs")
        SELECT * FROM UNNEST(
          ${unique.map((e) => e.eventId)}::text[],
          ${unique.map((e) => e.type)}::text[],
          ${unique.map((e) => e.leadId)}::uuid[],
          ${unique.map((e) => pgTimestamp(e.webhookAt))}::timestamp[],
          ${unique.map(() => consumed)}::timestamp[],
          ${unique.map(latency)}::int[])
        ON CONFLICT ("eventId") DO NOTHING
        RETURNING "eventId"`;
      const fresh = new Set(inserted.map((r) => r.eventId));
      const counted = unique.filter((e) => fresh.has(e.eventId));
      if (counted.length === 0) return 0;

      const { days, scores } = aggregate(counted);
      await tx.$executeRaw`
        INSERT INTO daily_stats ("day", "received", "scored", "emailed", "scoreSum")
        SELECT * FROM UNNEST(
          ${days.map((d) => d.day)}::date[],
          ${days.map((d) => d.received)}::int[],
          ${days.map((d) => d.scored)}::int[],
          ${days.map((d) => d.emailed)}::int[],
          ${days.map((d) => d.scoreSum)}::int[])
        ON CONFLICT ("day") DO UPDATE SET
          "received" = daily_stats."received" + EXCLUDED."received",
          "scored"   = daily_stats."scored"   + EXCLUDED."scored",
          "emailed"  = daily_stats."emailed"  + EXCLUDED."emailed",
          "scoreSum" = daily_stats."scoreSum" + EXCLUDED."scoreSum"`;

      if (scores.length > 0) {
        await tx.$executeRaw`
          INSERT INTO score_distribution ("score", "count")
          SELECT * FROM UNNEST(${scores.map((s) => s.score)}::int[], ${scores.map((s) => s.count)}::int[])
          ON CONFLICT ("score") DO UPDATE SET "count" = score_distribution."count" + EXCLUDED."count"`;
      }
      return counted.length;
    });

    return { applied, duplicates: events.length - applied };
  }
}
