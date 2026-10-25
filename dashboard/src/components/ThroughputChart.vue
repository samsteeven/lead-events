<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import type { LatencyPoint } from '../api';
import { baseOptions, COLORS } from '../charts';

const props = defineProps<{ points: LatencyPoint[] }>();

const data = computed(() => ({
  labels: props.points.map((p) => new Date(p.minute).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })),
  datasets: [{ label: 'Événements consommés', data: props.points.map((p) => p.events), backgroundColor: COLORS.emailed, borderRadius: 3 }],
}));
const options = { ...baseOptions(), plugins: { legend: { display: false } } };
</script>

<template>
  <div class="chart" role="img" aria-label="Événements consommés par minute">
    <Bar :data="data" :options="options as never" />
  </div>
</template>

<style scoped>
.chart { height: 260px; }
</style>
