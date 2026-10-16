/**
 * hitlBus.ts
 * Satu pintu permintaan izin HITL Chat GUI dari semua sumber: jembatan MCP Claude (event Tauri) dan driver
 * JSON-RPC Codex app-server / OpenCode ACP (di frontend). `useHitlPermissions` menjadi satu-satunya penjawab.
 * Spesifikasi: specs/agent-protocols.md §7.
 */

export interface PermissionAsk {
  /** Id pesan agen (= sessionId `spawn_headless_agent`). */
  sessionId: string;
  /** Unik per permintaan (Claude: `tool_use_id`, Codex/OpenCode: id dari driver). */
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  /**
   * Konteks untuk permintaan yang diajukan setelah giliran CLI selesai (Antigravity): tidak terikat sesi
   * yang sedang berjalan dan tidak dibuang saat sesi itu berakhir.
   */
  context?: { conversationId?: string; projectPath?: string; agentId?: string };
}

/** `respond` mengirim keputusan ke CLI yang menunggu; dipanggil tepat sekali. */
export type PermissionHandler = (ask: PermissionAsk, respond: (approved: boolean) => Promise<void>) => void;

let handler: PermissionHandler | null = null;

/** Dipasang oleh `useHitlPermissions`; mengembalikan fungsi pelepas. */
export function setPermissionHandler(h: PermissionHandler): () => void {
  handler = h;
  return () => {
    if (handler === h) handler = null;
  };
}

/** Meneruskan permintaan ke penjawab aktif dengan kanal jawaban milik sumbernya. */
export function dispatchPermission(ask: PermissionAsk, respond: (approved: boolean) => Promise<void>): void {
  if (handler) handler(ask, respond);
  else void respond(false).catch(() => {});
}

/** Untuk driver JSON-RPC: menunggu keputusan pengguna. Tanpa penjawab (mis. UI belum siap) = tolak. */
export function askPermission(ask: PermissionAsk): Promise<boolean> {
  return new Promise((resolve) => {
    dispatchPermission(ask, async (approved) => resolve(approved));
  });
}
