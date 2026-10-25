<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import type { DailyPoint } from '../api';
import { baseOptions, COLORS } from '../charts';

const props = defineProps<{ points: DailyPoint[] }>();

const data = computed(() => ({
  labels: props.points.map((p) => p.day.slice(5)),
  datasets: [
    { label: 'Reçus', data: props.points.map((p) => p.received), backgroundColor: COLORS.received, borderRadius: 3 },
    { label: 'Scorés', data: props.points.map((p) => p.scored), backgroundColor: COLORS.scored, borderRadius: 3 },
    { label: 'E-mails envoyés', data: props.points.map((p) => p.emailed), backgroundColor: COLORS.emailed, borderRadius: 3 },
  ],
}));
</script>

<template>
  <div class="chart" role="img" aria-label="Leads reçus, scorés et e-mails envoyés par jour">
    <Bar :data="data" :options="baseOptions() as never" />
  </div>
</template>

<style scoped>
.chart { height: 260px; }
</style>
