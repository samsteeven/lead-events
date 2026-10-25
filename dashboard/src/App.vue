<script setup lang="ts">
import { computed } from 'vue';
import { formatDuration, formatNumber } from './api';
import { useDashboard } from './composables/useDashboard';
import DailyChart from './components/DailyChart.vue';
import KpiCard from './components/KpiCard.vue';
import LatencyChart from './components/LatencyChart.vue';
import LeadsTable from './components/LeadsTable.vue';
import ScoreChart from './components/ScoreChart.vue';
import ThroughputChart from './components/ThroughputChart.vue';
import TokenGate from './components/TokenGate.vue';

const { token, snapshot, error, lastUpdate, signIn, signOut } = useDashboard();

const summary = computed(() => snapshot.value?.summary);
const latencyTone = computed(() => {
  const p95 = summary.value?.latency.p95;
  return p95 === null || p95 === undefined ? 'default' : p95 > 1000 ? 'warn' : 'good';
});
</script>

<template>
  <TokenGate v-if="!token" :error="error" @submit="signIn" />

  <main v-else class="page">
    <header class="top">
      <div>
        <h1>Lead Events</h1>
        <p class="sub">Agent de qualification n8n : leads reçus, scorés, e-mail envoyé, suivis via Kafka.</p>
      </div>
      <div class="status">
        <span v-if="error" class="error" role="alert">{{ error }}</span>
        <span v-else-if="lastUpdate" class="muted">
          <span class="dot" aria-hidden="true"></span>Mis à jour à {{ lastUpdate.toLocaleTimeString('fr-FR') }}
        </span>
        <button class="link" type="button" @click="signOut">Se déconnecter</button>
      </div>
    </header>

    <p v-if="!snapshot" class="muted">Chargement…</p>

    <template v-else>
      <section class="kpis" aria-label="Indicateurs">
        <KpiCard label="Leads reçus" :value="formatNumber(summary?.received)" />
        <KpiCard label="Scorés" :value="formatNumber(summary?.scored)" />
        <KpiCard label="E-mails envoyés" :value="formatNumber(summary?.emailed)" :hint="summary?.emailRate != null ? `${formatNumber(summary.emailRate, 1)} % des leads reçus` : undefined" tone="good" />
        <KpiCard label="Score moyen" :value="formatNumber(summary?.avgScore, 1)" hint="sur 10" />
        <KpiCard label="Événements / min" :value="formatNumber(summary?.eventsLastMinute)" />
        <KpiCard
          label="Latence p95"
          :value="formatDuration(summary?.latency.p95)"
          :hint="`webhook → consommé, ${summary?.latencyWindowMinutes} dernières min (p50 ${formatDuration(summary?.latency.p50)})`"
          :tone="latencyTone"
        />
      </section>

      <section class="grid">
        <article class="card wide">
          <h2>Leads par jour</h2>
          <DailyChart :points="snapshot.daily" />
        </article>
        <article class="card">
          <h2>Répartition des scores</h2>
          <ScoreChart :points="snapshot.scores" />
        </article>
        <article class="card wide">
          <h2>Latence webhook → événement consommé</h2>
          <LatencyChart :points="snapshot.latency" />
          <p class="foot">
            Depuis le début : {{ formatNumber(summary?.latencyAllTime.count) }} événements, p50
            {{ formatDuration(summary?.latencyAllTime.p50) }}, p95 {{ formatDuration(summary?.latencyAllTime.p95) }}, max
            {{ formatDuration(summary?.latencyAllTime.max) }}.
          </p>
        </article>
        <article class="card">
          <h2>Événements consommés par minute</h2>
          <ThroughputChart :points="snapshot.latency" />
        </article>
        <article class="card full">
          <h2>Derniers leads</h2>
          <LeadsTable :leads="snapshot.leads" />
        </article>
      </section>
    </template>
  </main>
</template>

<style scoped>
.page { max-width: 1180px; margin: 0 auto; padding: 24px 20px 48px; display: flex; flex-direction: column; gap: 20px; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
h1 { margin: 0; font-size: 24px; }
.sub { margin: 4px 0 0; color: var(--muted); font-size: 14px; }
.status { display: flex; align-items: center; gap: 14px; font-size: 13px; }
.muted { color: var(--muted); }
.error { color: var(--bad); font-weight: 600; }
.dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--good); }
.link { background: none; border: 0; color: var(--accent); cursor: pointer; font: inherit; padding: 0; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; min-width: 0; }
.card h2 { margin: 0 0 12px; font-size: 15px; }
.wide { grid-column: span 2; }
.full { grid-column: 1 / -1; }
.foot { margin: 10px 0 0; font-size: 12px; color: var(--muted); }
@media (max-width: 860px) {
  .grid { grid-template-columns: 1fr; }
  .wide, .full { grid-column: auto; }
}
</style>
