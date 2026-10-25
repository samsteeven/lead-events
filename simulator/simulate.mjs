// Simule l'agent n8n « Lead Agent » : pour chaque lead synthétique, envoie les trois appels signés du workflow
// (lead reçu, lead scoré, e-mail envoyé), puis mesure combien d'événements ont été consommés et en combien de temps.
//
//   node simulator/simulate.mjs --leads 200 --concurrency 20          # rapide : enchaîne les trois appels sans pause
//   node simulator/simulate.mjs --leads 20 --realistic                # pauses proches de la production (score 2 à 8 s, e-mail 1 à 3 s)
//   node simulator/simulate.mjs --leads 500 --duplicates 0.05         # 5 % d'appels rejoués, comme un n8n qui réessaie
//   node simulator/simulate.mjs --leads 600 --rate 20                 # débit constant : 20 nouveaux leads par seconde
//
// Aucune donnée réelle : noms, entreprises et messages sont tirés de listes fictives, les e-mails sont en @example.test.
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- options
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);
const LEADS = Number(args.leads ?? 50);
const CONCURRENCY = Number(args.concurrency ?? 20);
const DUPLICATES = Number(args.duplicates ?? 0);
/** Débit d'arrivée en leads par seconde (0 = aussi vite que la concurrence le permet). */
const RATE = Number(args.rate ?? 0);
const REALISTIC = Boolean(args.realistic);
const BASE = args.base ?? process.env.BASE ?? 'http://localhost:3000';

function readEnv() {
  const file = join(root, '.env');
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}
const env = { ...readEnv(), ...process.env };
const SECRET = env.WEBHOOK_SECRET;
const TOKEN = env.DASHBOARD_TOKEN;
if (!SECRET || !TOKEN) throw new Error('WEBHOOK_SECRET et DASHBOARD_TOKEN sont requis (fichier .env à la racine ou variables d\'environnement)');

// ---------------------------------------------------------------- données fictives
const FIRST = ['Camille', 'Lucas', 'Inès', 'Hugo', 'Léa', 'Nathan', 'Manon', 'Jules', 'Sarah', 'Théo', 'Clara', 'Adam'];
const LAST = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent'];
const COMPANIES = ['Atelier Nova', 'Brasserie Delta', 'Cabinet Orion', 'Digitalis', 'EcoTransports', 'Fabrik 21', 'Galaxie Conseil', 'Horizon Santé', 'Ingénia', 'Jardin Pro'];
const MESSAGES = [
  'Bonjour, nous cherchons à automatiser le suivi de nos demandes clients. Pouvez-vous nous rappeler ?',
  'Nous aimerions un devis pour un site vitrine avec prise de rendez-vous en ligne.',
  'Besoin d\'une application interne pour gérer nos commandes, budget à définir.',
  'Simple demande d\'information sur vos tarifs.',
  'Projet urgent : refonte de notre portail client avant la fin du trimestre.',
];
const REASONS = ['budget confirmé et besoin urgent', 'besoin clair, budget à préciser', 'demande exploratoire', 'entreprise établie, décideur identifié'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const between = (min, max) => min + Math.random() * (max - min);
/** Scores plutôt moyens à bons, comme un agent qui filtre des demandes réelles. */
const randomScore = () => pick([2, 3, 4, 5, 5, 6, 6, 7, 7, 7, 8, 8, 9, 10]);

// ---------------------------------------------------------------- envoi signé
const RUN = randomUUID().slice(0, 8);
const httpTimes = [];
const counts = { accepted: 0, duplicate: 0, failed: 0, retried: 0 };

async function post(payload) {
  const raw = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', SECRET).update(`${t}.`).update(raw).digest('hex');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const start = performance.now();
    try {
      const res = await fetch(`${BASE}/webhooks/n8n`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-lead-signature': `t=${t},v1=${signature}` },
        body: raw,
      });
      httpTimes.push(performance.now() - start);
      if (res.ok) return await res.json();
      if (res.status < 500) throw new Error(`HTTP ${res.status} : ${await res.text()}`); // erreur de l'appelant : inutile de réessayer
    } catch (e) {
      if (attempt === 3 || String(e).includes('HTTP 4')) throw e;
    }
    counts.retried++;
    await sleep(200 * attempt);
  }
}

async function runLead(n) {
  const first = pick(FIRST);
  const last = pick(LAST);
  const lead = {
    externalId: `${RUN}-${n}`,
    email: `${first}.${last}.${n}@example.test`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
    fullName: `${first} ${last}`,
    company: pick(COMPANIES),
    message: pick(MESSAGES),
    source: 'contact-form',
  };
  const event = (type, extra = {}) => ({ type, idempotencyKey: `${RUN}-${n}:${type}`, occurredAt: new Date().toISOString(), lead, ...extra });

  const send = async (payload) => {
    const result = await post(payload);
    result.duplicate ? counts.duplicate++ : counts.accepted++;
    // Un n8n qui réessaie renvoie exactement le même appel : l'API doit répondre « doublon » sans republier.
    if (Math.random() < DUPLICATES) {
      const replay = await post(payload);
      replay.duplicate ? counts.duplicate++ : counts.accepted++;
    }
  };

  await send(event('lead.received'));
  if (REALISTIC) await sleep(between(2000, 8000)); // enrichissement Tavily + appel au modèle
  await send(event('lead.scored', { score: randomScore(), scoreReason: pick(REASONS) }));
  if (REALISTIC) await sleep(between(1000, 3000)); // rédaction puis envoi de l'e-mail
  await send(event('email.sent'));
}

// ---------------------------------------------------------------- exécution et mesure
const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : NaN);
const fmt = (ms) => (Number.isNaN(ms) ? 'n/a' : ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(2)} s`);

async function consumedCount() {
  const res = await fetch(`${BASE}/stats/summary?minutes=1`, { headers: { authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`/stats/summary : HTTP ${res.status}`);
  const s = await res.json();
  return s.latencyAllTime.count;
}

/** Latence « webhook -> consommé » des seuls événements de cette exécution, lue directement dans PostgreSQL. */
function runLatency() {
  const sql = `SELECT COUNT(*), COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs"), 0), COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs"), 0), COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY "latencyMs"), 0), COALESCE(MAX("latencyMs"), 0) FROM processed_events WHERE "eventId" LIKE '${RUN}-%'`;
  const out = execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'leadevents', '-d', 'leadevents', '-At', '-F', ',', '-c', sql], { cwd: root, encoding: 'utf8' });
  const [count, p50, p95, p99, max] = out.trim().split(',').map(Number);
  return { count, p50, p95, p99, max };
}

const expectedEvents = LEADS * 3;
console.log(`Exécution ${RUN} : ${LEADS} leads (${expectedEvents} événements), ${RATE > 0 ? `débit constant de ${RATE} leads/s` : `concurrence ${CONCURRENCY}`}, ${REALISTIC ? 'pauses réalistes' : 'sans pause'}, ${(DUPLICATES * 100).toFixed(0)} % de rejeux`);

const before = await consumedCount();
const started = performance.now();
let next = 0;
let failures = 0;
const runOne = async (n) => {
  try {
    await runLead(n);
  } catch (e) {
    failures++;
    counts.failed++;
    console.error(`lead ${n} : ${e.message}`);
  }
};
if (RATE > 0) {
  // Débit imposé : le lead n démarre à n / RATE secondes, qu'un lead précédent ait fini ou non (arrivées indépendantes).
  const running = [];
  for (let n = 0; n < LEADS; n++) {
    const delay = started + (n / RATE) * 1000 - performance.now();
    if (delay > 0) await sleep(delay);
    running.push(runOne(n));
  }
  await Promise.all(running);
} else {
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < LEADS) await runOne(next++);
    }),
  );
}
const sendSeconds = (performance.now() - started) / 1000;

// Attend que le consumer ait traité tous les événements envoyés (ou 60 s sans progrès).
const successfulEvents = expectedEvents - failures * 3; // approximation si des leads ont échoué
let consumed = (await consumedCount()) - before;
let lastProgress = Date.now();
while (consumed < successfulEvents && Date.now() - lastProgress < 60_000) {
  await sleep(250);
  const now = (await consumedCount()) - before;
  if (now > consumed) lastProgress = Date.now();
  consumed = now;
}
const drainSeconds = (performance.now() - started) / 1000;

httpTimes.sort((a, b) => a - b);
console.log(`\nEnvoi : ${sendSeconds.toFixed(1)} s, ${(counts.accepted + counts.duplicate) / sendSeconds > 0 ? ((counts.accepted + counts.duplicate) / sendSeconds).toFixed(1) : 0} appels/s`);
console.log(`  appels acceptés : ${counts.accepted} · rejeux reconnus (doublons) : ${counts.duplicate} · réessais : ${counts.retried} · échecs : ${counts.failed}`);
console.log(`  réponse HTTP du webhook : p50 ${fmt(percentile(httpTimes, 0.5))}, p95 ${fmt(percentile(httpTimes, 0.95))}, max ${fmt(httpTimes[httpTimes.length - 1])}`);

const lat = runLatency();
console.log(`\nConsommation : ${lat.count} / ${successfulEvents} événements comptés par le consumer (${drainSeconds.toFixed(1)} s au total)`);
console.log(`  latence webhook -> événement consommé : p50 ${fmt(lat.p50)}, p95 ${fmt(lat.p95)}, p99 ${fmt(lat.p99)}, max ${fmt(lat.max)}`);
console.log(`  leads traités de bout en bout : ${Math.floor(lat.count / 3)}`);

const ok = failures === 0 && lat.count === expectedEvents;
console.log(ok ? '\nOK : aucun événement perdu, aucun doublon compté.' : '\nÉCART : tous les événements attendus ne sont pas comptés exactement une fois.');
process.exit(ok ? 0 : 1);
