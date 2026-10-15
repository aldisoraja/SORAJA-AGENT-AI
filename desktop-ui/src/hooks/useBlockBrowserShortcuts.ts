/**
 * useBlockBrowserShortcuts.ts
 * WebView2 memiliki pintasan bawaan yang me-reload/menavigasi halaman (F5, Ctrl+R, Alt+←/→).
 * Di aplikasi desktop itu akan menghancurkan sesi terminal CLI yang sedang berjalan, sementara
 * Ctrl+R justru dipakai CLI (pencarian riwayat). Default browser dicegah di fase capture;
 * event TIDAK dihentikan, sehingga xterm tetap meneruskan tombolnya ke CLI.
 */
import { useEffect } from 'react';
import { isTauri } from '../components/terminal/ptyTransport';

export function isReloadOrNavigateShortcut(e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  if (key === 'f5') return true;
  if ((e.ctrlKey || e.metaKey) && key === 'r') return true;
  if (e.altKey && (key === 'arrowleft' || key === 'arrowright')) return true;
  return false;
}

export function useBlockBrowserShortcuts() {
  useEffect(() => {
    if (!isTauri) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isReloadOrNavigateShortcut(e)) e.preventDefault();
    };
    // Seret-lepas berkas ke jendela akan menavigasi webview ke berkas itu → cegah.
    const onDrop = (e: DragEvent) => e.preventDefault();
    const onDragOver = (e: DragEvent) => e.preventDefault();
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDragOver);
    };
  }, []);
}
