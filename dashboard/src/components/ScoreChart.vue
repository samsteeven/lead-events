<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import type { ScorePoint } from '../api';
import { baseOptions, COLORS } from '../charts';

const props = defineProps<{ points: ScorePoint[] }>();

const data = computed(() => ({
  labels: props.points.map((p) => String(p.score)),
  datasets: [{ label: 'Leads', data: props.points.map((p) => p.count), backgroundColor: COLORS.scored, borderRadius: 3 }],
}));
const options = { ...baseOptions(), plugins: { legend: { display: false } } };
</script>

<template>
  <div class="chart" role="img" aria-label="Répartition des scores de 1 à 10">
    <Bar :data="data" :options="options as never" />
  </div>
</template>

<style scoped>
.chart { height: 260px; }
</style>
