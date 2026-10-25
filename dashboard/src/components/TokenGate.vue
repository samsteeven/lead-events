<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ error: string | null }>();
const emit = defineEmits<{ submit: [token: string] }>();
const value = ref('');
</script>

<template>
  <form class="gate" @submit.prevent="value.trim() && emit('submit', value)">
    <h1>Lead Events</h1>
    <p>Les statistiques et la liste des leads sont réservées : saisissez le jeton du tableau de bord.</p>
    <label for="token">Jeton</label>
    <input id="token" v-model="value" type="password" autocomplete="off" placeholder="DASHBOARD_TOKEN" autofocus />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button type="submit" :disabled="!value.trim()">Afficher le tableau de bord</button>
  </form>
</template>

<style scoped>
.gate {
  max-width: 380px;
  margin: 12vh auto 0;
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
}
h1 { margin: 0; font-size: 22px; }
p { margin: 0; color: var(--muted); font-size: 14px; }
label { font-size: 13px; font-weight: 600; margin-top: 6px; }
input { padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font: inherit; background: var(--bg); color: inherit; }
input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button { margin-top: 6px; padding: 10px 14px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.error { color: var(--bad); }
</style>
