export interface LatencyStats {
  count: number;
  p50: number | null;
  p95: number | null;
  avg: number | null;
  max: number | null;
}

export interface Summary {
  received: number;
  scored: number;
  emailed: number;
  avgScore: number | null;
  emailRate: number | null;
  eventsLastMinute: number;
  latencyWindowMinutes: number;
  latency: LatencyStats;
  latencyAllTime: LatencyStats;
}

export interface DailyPoint {
  day: string;
  received: number;
  scored: number;
  emailed: number;
  avgScore: number | null;
}

export interface ScorePoint {
  score: number;
  count: number;
}

export interface LatencyPoint {
  minute: string;
  events: number;
  p50: number;
  p95: number;
}

export type LeadStatus = 'RECEIVED' | 'SCORED' | 'EMAILED';

export interface LeadRow {
  id: string;
  email: string;
  company: string | null;
  source: string;
  status: LeadStatus;
  score: number | null;
  receivedAt: string;
  scoredAt: string | null;
  emailSentAt: string | null;
}

/** Jeton refusé par l'API : le tableau de bord redemande le jeton. */
export class UnauthorizedError extends Error {}

const TOKEN_KEY = 'lead-events:token';

/** Le jeton reste dans sessionStorage (effacé à la fermeture de l'onglet), jamais dans le code ni l'URL. */
export const tokenStore = {
  get: (): string | null => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string): void => {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* stockage indisponible : le jeton ne sera pas mémorisé */
    }
  },
  clear: (): void => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* rien à effacer */
    }
  },
};

async function get<T>(path: string, token: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (response.status === 401) throw new UnauthorizedError('jeton refusé');
  if (!response.ok) throw new Error(`API ${path} : HTTP ${response.status}`);
  return (await response.json()) as T;
}

export interface Snapshot {
  summary: Summary;
  daily: DailyPoint[];
  scores: ScorePoint[];
  latency: LatencyPoint[];
  leads: LeadRow[];
}

/** Récupère d'un coup tout ce que le tableau de bord affiche. */
export async function loadSnapshot(token: string, signal?: AbortSignal): Promise<Snapshot> {
  const [summary, daily, scores, latency, leads] = await Promise.all([
    get<Summary>('/stats/summary?minutes=15', token, signal),
    get<DailyPoint[]>('/stats/daily?days=14', token, signal),
    get<ScorePoint[]>('/stats/scores', token, signal),
    get<LatencyPoint[]>('/stats/latency?minutes=30', token, signal),
    get<LeadRow[]>('/leads?limit=20', token, signal),
  ]);
  return { summary, daily, scores, latency, leads };
}

/** `1 234` pour les milliers ; `—` quand la valeur n'existe pas encore. */
export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Durée en millisecondes, lisible : `84 ms`, `1,2 s`. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
}

/** « il y a 12 s », « il y a 3 min », « il y a 2 h », « il y a 4 j ». */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `il y a ${seconds} s`;
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)} h`;
  return `il y a ${Math.floor(seconds / 86400)} j`;
}
