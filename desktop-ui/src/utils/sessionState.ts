/**
 * sessionState.ts
 * Penyimpanan ringan di sessionStorage agar mode tampilan, agen terpilih, dan tab terminal
 * selamat dari reload webview (mis. HMR Vite saat CLI mengedit berkas proyek).
 */
const PREFIX = 'soraja.session.';

export function loadSessionState<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveSessionState(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // sessionStorage tidak tersedia/penuh: abaikan, aplikasi tetap berjalan tanpa persistensi
  }
}
