<script setup lang="ts">
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import type { LatencyPoint } from '../api';
import { baseOptions, COLORS } from '../charts';

const props = defineProps<{ points: LatencyPoint[] }>();

const data = computed(() => ({
  labels: props.points.map((p) => new Date(p.minute).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })),
  datasets: [
    { label: 'p50 (ms)', data: props.points.map((p) => p.p50), borderColor: COLORS.p50, backgroundColor: COLORS.p50, tension: 0.3, pointRadius: 2 },
    { label: 'p95 (ms)', data: props.points.map((p) => p.p95), borderColor: COLORS.p95, backgroundColor: COLORS.p95, tension: 0.3, pointRadius: 2 },
  ],
}));
const options = {
  ...baseOptions(),
  scales: { ...baseOptions().scales, y: { beginAtZero: true, title: { display: true, text: 'ms' } } },
};
</script>

<template>
  <div class="chart" role="img" aria-label="Latence entre l'arrivée du webhook et le traitement de l'événement, p50 et p95 par minute">
    <Line :data="data" :options="options as never" />
  </div>
</template>

<style scoped>
.chart { height: 260px; }
</style>
