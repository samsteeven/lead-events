import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js';

// Seuls les éléments utilisés sont enregistrés : le paquet reste léger.
ChartJS.register(BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend);

export const COLORS = {
  received: '#4f6df5',
  scored: '#9b5de5',
  emailed: '#10b981',
  p50: '#4f6df5',
  p95: '#f59e0b',
  events: 'rgba(148, 163, 184, 0.55)',
} as const;

/** Réglages communs : animations coupées (le graphique se redessine toutes les 3 s) et axes discrets. */
export function baseOptions(): ChartOptions<'bar' | 'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
  };
}
