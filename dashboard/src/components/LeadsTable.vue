<script setup lang="ts">
import { timeAgo, type LeadRow, type LeadStatus } from '../api';

defineProps<{ leads: LeadRow[] }>();

const LABELS: Record<LeadStatus, string> = { RECEIVED: 'Reçu', SCORED: 'Scoré', EMAILED: 'E-mail envoyé' };
</script>

<template>
  <div class="wrap">
    <table v-if="leads.length > 0">
      <thead>
        <tr>
          <th>Lead</th>
          <th>Entreprise</th>
          <th>Statut</th>
          <th class="num">Score</th>
          <th>Reçu</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="lead in leads" :key="lead.id">
          <td>{{ lead.email }}</td>
          <td>{{ lead.company ?? '—' }}</td>
          <td>
            <span class="badge" :class="lead.status.toLowerCase()">{{ LABELS[lead.status] }}</span>
          </td>
          <td class="num">{{ lead.score ?? '—' }}</td>
          <td class="muted">{{ timeAgo(lead.receivedAt) }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">Aucun lead pour l'instant. Lancez le simulateur ou raccordez n8n (voir le README).</p>
  </div>
</template>

<style scoped>
.wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--border); }
td { padding: 9px 10px; border-bottom: 1px solid var(--border); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); white-space: nowrap; }
.badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badge.received { background: #e0e7ff; color: #3730a3; }
.badge.scored { background: #ede9fe; color: #5b21b6; }
.badge.emailed { background: #d1fae5; color: #065f46; }
.empty { color: var(--muted); padding: 24px 10px; margin: 0; }

@media (prefers-color-scheme: dark) {
  .badge.received { background: #312e81; color: #c7d2fe; }
  .badge.scored { background: #4c1d95; color: #ddd6fe; }
  .badge.emailed { background: #064e3b; color: #a7f3d0; }
}
</style>
