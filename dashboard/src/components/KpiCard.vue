<script setup lang="ts">
defineProps<{ label: string; value: string; hint?: string; tone?: 'default' | 'good' | 'warn' }>();
</script>

<template>
  <div class="kpi" :class="tone ?? 'default'">
    <span class="kpi-label">{{ label }}</span>
    <strong class="kpi-value">{{ value }}</strong>
    <span v-if="hint" class="kpi-hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.kpi {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  border-top: 3px solid var(--accent);
}
.kpi.good { border-top-color: var(--good); }
.kpi.warn { border-top-color: var(--warn); }
.kpi-label { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.kpi-value { font-size: 28px; line-height: 1.1; font-variant-numeric: tabular-nums; }
.kpi-hint { font-size: 12px; color: var(--muted); }
</style>
