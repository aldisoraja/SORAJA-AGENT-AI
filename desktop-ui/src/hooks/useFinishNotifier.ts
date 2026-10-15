import { useEffect, useRef } from 'react';
import type { MessageRecord } from '../types/database';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Nada pendek dua ketukan via Web Audio (tanpa berkas suara). */
export function playFinishChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.14;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* Audio tidak tersedia: abaikan. */
  }
}

/**
 * Pengaturan "Beri tahu saat AI selesai": bunyikan nada, dan bila jendela sedang
 * tidak aktif, kedipkan ikon di taskbar Windows. Tidak berbunyi bila dihentikan pengguna.
 */
export function useFinishNotifier(isGenerating: boolean, messages: MessageRecord[], enabled: boolean) {
  const wasGenerating = useRef(false);

  useEffect(() => {
    const finished = wasGenerating.current && !isGenerating;
    wasGenerating.current = isGenerating;
    if (!finished || !enabled) return;

    const last = [...messages].reverse().find((m) => m.sender === 'agent');
    if (last?.status === 'stopped') return;
    playFinishChime();

    if (document.hasFocus()) return;
    if (isTauri) {
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow, UserAttentionType }) => getCurrentWindow().requestUserAttention(UserAttentionType.Informational))
        .catch(() => {});
      return;
    }
    const original = document.title;
    document.title = `✓ ${last?.agentName ?? 'AI'} selesai — ${original}`;
    const restore = () => {
      document.title = original;
      window.removeEventListener('focus', restore);
    };
    window.addEventListener('focus', restore);
  }, [isGenerating, messages, enabled]);
}
