import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LatencyStats {
  count: number;
  p50: number | null;
  p95: number | null;
  avg: number | null;
  max: number | null;
}

/** `jane.doe@acme.com` devient `j***@acme.com` : la liste des leads ne montre jamais une adresse complète. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Totaux, score moyen et latence « webhook -> événement consommé », tous calculés par le consumer. */
  async summary(minutes: number) {
    const [totals] = await this.prisma.$queryRaw<
      { received: bigint | null; scored: bigint | null; emailed: bigint | null; scoreSum: bigint | null }[]
    >`SELECT SUM("received") AS received, SUM("scored") AS scored, SUM("emailed") AS emailed, SUM("scoreSum") AS "scoreSum" FROM daily_stats`;

    const received = Number(totals?.received ?? 0);
    const scored = Number(totals?.scored ?? 0);
    const emailed = Number(totals?.emailed ?? 0);
    const scoreSum = Number(totals?.scoreSum ?? 0);

    const [perMinute] = await this.prisma.$queryRaw<{ events: number }[]>`
      SELECT COUNT(*)::int AS events FROM processed_events
      WHERE "consumedAt" >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '1 minute'`;

    return {
      received,
      scored,
      emailed,
      avgScore: scored > 0 ? Math.round((scoreSum / scored) * 10) / 10 : null,
      /** Part des leads reçus pour lesquels un e-mail est parti. */
      emailRate: received > 0 ? Math.round((emailed / received) * 1000) / 10 : null,
      eventsLastMinute: perMinute?.events ?? 0,
      latencyWindowMinutes: minutes,
      latency: await this.latency(minutes),
      latencyAllTime: await this.latency(null),
    };
  }

  private async latency(minutes: number | null): Promise<LatencyStats> {
    const rows = await this.prisma.$queryRaw<
      { count: number; p50: number | null; p95: number | null; avg: number | null; max: number | null }[]
    >`SELECT COUNT(*)::int AS count,
             percentile_cont(0.5)  WITHIN GROUP (ORDER BY "latencyMs") AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95,
             AVG("latencyMs")::float AS avg,
             MAX("latencyMs")::float AS max
      FROM processed_events
      WHERE ${minutes}::int IS NULL OR "consumedAt" >= (NOW() AT TIME ZONE 'UTC') - make_interval(mins => ${minutes}::int)`;
    const r = rows[0];
    return { count: r?.count ?? 0, p50: n(r?.p50), p95: n(r?.p95), avg: n(r?.avg), max: n(r?.max) };
  }

  async daily(days: number) {
    const rows = await this.prisma.dailyStats.findMany({ orderBy: { day: 'desc' }, take: days });
    return rows.reverse().map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      received: r.received,
      scored: r.scored,
      emailed: r.emailed,
      avgScore: r.scored > 0 ? Math.round((r.scoreSum / r.scored) * 10) / 10 : null,
    }));
  }

  /** Répartition des scores de 1 à 10 (les scores jamais vus valent 0). */
  async scores() {
    const rows = await this.prisma.scoreBucket.findMany();
    const byScore = new Map(rows.map((r) => [r.score, r.count]));
    return Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: byScore.get(i + 1) ?? 0 }));
  }

  /** Latence p50 / p95 et nombre d'événements consommés, minute par minute. */
  async latencySeries(minutes: number) {
    const rows = await this.prisma.$queryRaw<{ minute: Date; events: number; p50: number; p95: number }[]>`
      SELECT date_trunc('minute', "consumedAt") AS minute,
             COUNT(*)::int AS events,
             percentile_cont(0.5)  WITHIN GROUP (ORDER BY "latencyMs") AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95
      FROM processed_events
      WHERE "consumedAt" >= (NOW() AT TIME ZONE 'UTC') - make_interval(mins => ${minutes}::int)
      GROUP BY 1 ORDER BY 1`;
    return rows.map((r) => ({ minute: r.minute.toISOString(), events: r.events, p50: Number(r.p50), p95: Number(r.p95) }));
  }

  async recentLeads(limit: number) {
    const leads = await this.prisma.lead.findMany({ orderBy: { receivedAt: 'desc' }, take: limit });
    return leads.map((l) => ({
      id: l.id,
      email: maskEmail(l.email),
      company: l.company,
      source: l.source,
      status: l.status,
      score: l.score,
      receivedAt: l.receivedAt.toISOString(),
      scoredAt: l.scoredAt?.toISOString() ?? null,
      emailSentAt: l.emailSentAt?.toISOString() ?? null,
    }));
  }
}
