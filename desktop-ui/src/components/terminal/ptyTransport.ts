/**
 * ptyTransport.ts
 * Abstraksi transport PTY: Tauri IPC (aplikasi desktop) atau WebSocket HMR Vite (dev di browser).
 * Kontrak IPC: specs/ipc-contracts.md §1.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface ViteHot {
  send: (event: string, payload: unknown) => void;
  on: (event: string, cb: (payload: any) => void) => void;
  off?: (event: string, cb: (payload: any) => void) => void;
}

const hot = (import.meta as unknown as { hot?: ViteHot }).hot;

export interface PtySpawnRequest {
  sessionId: string;
  agentExecutable: string;
  agentArgs: string[];
  cwd: string;
  cols: number;
  rows: number;
  envs: Record<string, string>;
}

type Transport = 'tauri' | 'hmr' | 'none';

/**
 * Siklus hidup sesi PTY di sisi frontend.
 * React StrictMode (dev) menjalankan effect → cleanup → effect lagi secara sinkron. Tanpa pengaman,
 * itu memicu spawn → close → spawn untuk sessionId yang sama; exit proses pertama lalu "menimpa"
 * sesi kedua (input hilang, indikator kuning). Karena itu:
 * - spawn idempoten per sessionId (promise dibagi),
 * - close ditunda (`ptyRelease`) dan dibatalkan jika view yang sama segera mount ulang (`ptyRetain`).
 */
const spawnPromises = new Map<string, Promise<Transport>>();
const pendingCloses = new Map<string, ReturnType<typeof setTimeout>>();
const CLOSE_DELAY_MS = 250;

/** Dipanggil saat view terminal mount: membatalkan close yang tertunda untuk sesi ini. */
export function ptyRetain(sessionId: string): void {
  const timer = pendingCloses.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    pendingCloses.delete(sessionId);
  }
}

/** Dipanggil saat view terminal unmount: menutup PTY bila tidak segera dipakai lagi. */
export function ptyRelease(sessionId: string): void {
  ptyRetain(sessionId);
  pendingCloses.set(
    sessionId,
    setTimeout(() => {
      pendingCloses.delete(sessionId);
      spawnPromises.delete(sessionId);
      ptyClose(sessionId);
    }, CLOSE_DELAY_MS)
  );
}

/** Spawn sekali per sessionId. Mengembalikan transport yang dipakai, atau melempar error jika gagal. */
export function ptySpawn(req: PtySpawnRequest): Promise<Transport> {
  const existing = spawnPromises.get(req.sessionId);
  if (existing) return existing;
  const promise = (async (): Promise<Transport> => {
    if (isTauri) {
      await invoke('start_interactive_pty', { ...req });
      return 'tauri';
    }
    if (hot) {
      hot.send('custom:pty-spawn', req);
      return 'hmr';
    }
    return 'none';
  })();
  spawnPromises.set(req.sessionId, promise);
  promise.catch(() => spawnPromises.delete(req.sessionId));
  return promise;
}

export function hasSpawned(sessionId: string): boolean {
  return spawnPromises.has(sessionId);
}

export async function ptyWrite(sessionId: string, data: string): Promise<void> {
  if (isTauri) {
    // Pastikan spawn selesai dulu agar ketikan awal tidak hilang.
    await spawnPromises.get(sessionId)?.catch(() => undefined);
    await invoke('write_interactive_pty', { sessionId, data }).catch((err) =>
      console.error('Tauri PTY write error:', err)
    );
  } else {
    hot?.send('custom:pty-input', { sessionId, data });
  }
}

export function ptyResize(sessionId: string, cols: number, rows: number): void {
  if (isTauri) {
    invoke('resize_interactive_pty', { sessionId, cols, rows }).catch(() => {});
  } else {
    hot?.send('custom:pty-resize', { sessionId, cols, rows });
  }
}

export function ptyClose(sessionId: string): void {
  if (isTauri) {
    invoke('close_interactive_pty', { sessionId }).catch(() => {});
  } else {
    hot?.send('custom:pty-close', { sessionId });
  }
}

/** Berlangganan output & exit satu sesi PTY. Mengembalikan fungsi unsubscribe. */
export function subscribePty(
  sessionId: string,
  onOutput: (data: string) => void,
  onExit: (exitCode: number) => void
): () => void {
  let disposed = false;
  const cleanups: Array<() => void> = [];

  if (isTauri) {
    (async () => {
      // Output live ditahan sampai riwayat sesi (attach) dimuat; `seq <= endSeq` sudah ada di riwayat.
      let endSeq = 0;
      let replayDone = false;
      const queued: Array<{ data: string; seq?: number }> = [];
      const deliver = (p: { data: string; seq?: number }) => {
        if (p.seq !== undefined && p.seq <= endSeq) return;
        onOutput(p.data);
      };
      const unOut = await listen<{ sessionId: string; data: string; seq?: number }>('pty:output', (e) => {
        if (disposed || e.payload.sessionId !== sessionId) return;
        if (replayDone) deliver(e.payload);
        else queued.push(e.payload);
      });
      invoke<{ alive: boolean; data: string; endSeq: number }>('attach_interactive_pty', { sessionId })
        .then((r) => {
          if (disposed) return;
          endSeq = r.endSeq;
          if (r.data) onOutput(r.data);
        })
        .catch(() => undefined)
        .finally(() => {
          replayDone = true;
          if (!disposed) queued.splice(0).forEach(deliver);
        });
      const unExit = await listen<{ sessionId: string; exitCode: number }>('pty:exit', (e) => {
        if (!disposed && e.payload.sessionId === sessionId) onExit(e.payload.exitCode);
      });
      if (disposed) {
        unOut();
        unExit();
      } else {
        cleanups.push(unOut, unExit);
      }
    })().catch(() => {});
  } else if (hot) {
    const outHandler = (p: { sessionId: string; data: string }) => {
      if (!disposed && p.sessionId === sessionId) onOutput(p.data);
    };
    const exitHandler = (p: { sessionId: string; exitCode: number }) => {
      if (!disposed && p.sessionId === sessionId) onExit(p.exitCode);
    };
    hot.on('custom:pty-output', outHandler);
    hot.on('custom:pty-exit', exitHandler);
    cleanups.push(
      () => hot.off?.('custom:pty-output', outHandler),
      () => hot.off?.('custom:pty-exit', exitHandler)
    );
  }

  return () => {
    disposed = true;
    cleanups.forEach((fn) => fn());
  };
}
