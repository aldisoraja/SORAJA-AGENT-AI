import { useEffect } from 'react';
import type { AppSettings, UiScale } from '../types/database';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const UI_SCALE_FACTOR: Record<UiScale, number> = {
  small: 0.9,
  default: 1,
  large: 1.1,
  xlarge: 1.25,
};

/**
 * Menerapkan preferensi tampilan global dari Pengaturan:
 * - Ukuran tampilan → zoom WebView native (tata letak tetap pas di jendela).
 * - Kurangi animasi → kelas `reduce-motion` pada <html> (lihat index.css).
 */
export function useDisplayPreferences(settings: AppSettings | null) {
  const scale = UI_SCALE_FACTOR[settings?.uiScale ?? 'default'] ?? 1;
  const reduceMotion = settings?.reduceMotion ?? false;

  useEffect(() => {
    if (isTauri) {
      import('@tauri-apps/api/webview')
        .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(scale))
        .catch((err) => console.warn('Gagal mengatur zoom WebView:', err));
    } else {
      // Mode browser (dev): pendekatan CSS sebagai cadangan.
      (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = scale === 1 ? '' : String(scale);
    }
  }, [scale]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);
}
