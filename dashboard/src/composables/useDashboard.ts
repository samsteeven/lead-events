import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { loadSnapshot, tokenStore, UnauthorizedError, type Snapshot } from '../api';

/** Intervalle de rafraîchissement ; suspendu quand l'onglet est masqué pour ne pas interroger l'API pour rien. */
const REFRESH_MS = 3000;

export function useDashboard() {
  const token = ref<string | null>(tokenStore.get());
  const snapshot = shallowRef<Snapshot | null>(null);
  const error = ref<string | null>(null);
  const lastUpdate = ref<Date | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;
  let controller: AbortController | undefined;

  async function refresh(): Promise<void> {
    if (!token.value || document.visibilityState === 'hidden') return;
    controller?.abort(); // une réponse lente ne doit pas écraser une plus récente
    controller = new AbortController();
    try {
      snapshot.value = await loadSnapshot(token.value, controller.signal);
      lastUpdate.value = new Date();
      error.value = null;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      if (e instanceof UnauthorizedError) {
        signOut();
        error.value = 'Jeton refusé par l\'API.';
        return;
      }
      error.value = 'API injoignable : nouvel essai automatique.';
    }
  }

  function signIn(value: string): void {
    token.value = value.trim();
    tokenStore.set(token.value);
    error.value = null;
    void refresh();
  }

  function signOut(): void {
    tokenStore.clear();
    token.value = null;
    snapshot.value = null;
  }

  onMounted(() => {
    void refresh();
    timer = setInterval(() => void refresh(), REFRESH_MS);
    document.addEventListener('visibilitychange', () => void refresh());
  });
  onBeforeUnmount(() => {
    clearInterval(timer);
    controller?.abort();
  });

  return { token, snapshot, error, lastUpdate, signIn, signOut };
}
