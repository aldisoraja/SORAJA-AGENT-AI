/**
 * headlessTransport.ts
 * Transport CLI headless untuk Chat GUI saat aplikasi dibuka di browser (Vite dev): HMR WebSocket ke
 * `headlessBridge.ts`. Di aplikasi Tauri, IPC `spawn_headless_agent` dipakai (lihat cliAdapters.ts).
 * Nama event server→klien identik dengan event Tauri (specs/ipc-contracts.md §6).
 */

interface ViteHot {
  send: (event: string, payload: unknown) => void;
  on: (event: string, cb: (payload: any) => void) => void;
  off?: (event: string, cb: (payload: any) => void) => void;
}

const hot = (import.meta as unknown as { hot?: ViteHot }).hot;

export const isTauriRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** True bila CLI headless bisa dijalankan lewat jembatan Vite (browser dev, bukan Tauri). */
export const hasHeadlessBridge = !isTauriRuntime && !!hot;

export interface BridgeSpawnRequest {
  sessionId: string;
  agentId: string;
  agentArgs: string[];
  cwd: string;
  envs: Record<string, string>;
}

export function bridgeSpawn(req: BridgeSpawnRequest): void {
  hot?.send('custom:headless-spawn', req);
}

export function bridgeStop(sessionId: string): void {
  hot?.send('custom:headless-stop', { sessionId });
}

export interface BridgeHandlers {
  onStart: (payload: { sessionId: string; agent?: string; pid: number }) => void;
  onChunk: (payload: { sessionId: string; chunk: string }) => void;
  onEnd: (payload: { sessionId: string; exitCode: number; summary: string }) => void;
}

/** Berlangganan event sesi headless dari jembatan Vite. Mengembalikan fungsi unsubscribe. */
export function subscribeBridge(h: BridgeHandlers): () => void {
  if (!hot) return () => {};
  hot.on('agent:session_start', h.onStart);
  hot.on('agent:token_stream', h.onChunk);
  hot.on('agent:session_end', h.onEnd);
  return () => {
    hot.off?.('agent:session_start', h.onStart);
    hot.off?.('agent:token_stream', h.onChunk);
    hot.off?.('agent:session_end', h.onEnd);
  };
}
