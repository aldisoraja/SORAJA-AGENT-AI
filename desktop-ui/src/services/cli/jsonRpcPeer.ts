/**
 * jsonRpcPeer.ts
 * Klien JSON-RPC 2.0 per baris (NDJSON) di atas stdin/stdout CLI: dipakai driver Codex app-server dan
 * OpenCode ACP. Modul murni: penulisan diserahkan ke `write` (IPC `write_headless_agent_stdin` / tes).
 */
import type { StreamParser, UiAgentEvent } from './streamParsers.ts';

type Json = Record<string, any>;

export interface RpcIncoming {
  /** Notifikasi dari CLI (tanpa id). */
  notification?: { method: string; params: Json };
  /** Permintaan dari CLI ke klien (punya id + method): wajib dijawab lewat `reply`. */
  request?: { id: number | string; method: string; params: Json };
}

export class JsonRpcPeer {
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: Json) => void; reject: (e: Error) => void }>();

  private write: (line: string) => void;

  constructor(write: (line: string) => void) {
    this.write = write;
  }

  request(method: string, params: Json): Promise<Json> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  notify(method: string, params?: Json): void {
    this.write(JSON.stringify(params === undefined ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params }));
  }

  reply(id: number | string, result: Json): void {
    this.write(JSON.stringify({ jsonrpc: '2.0', id, result }));
  }

  replyError(id: number | string, message: string): void {
    this.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message } }));
  }

  /** Semua permintaan yang belum dijawab gagal (mis. proses CLI berhenti). */
  failAll(message: string): void {
    for (const p of this.pending.values()) p.reject(new Error(message));
    this.pending.clear();
  }

  /** Memproses satu pesan masuk: jawaban diselesaikan di sini, sisanya dikembalikan ke driver. */
  handle(msg: Json): RpcIncoming {
    const hasId = msg.id !== undefined && msg.id !== null;
    if (hasId && typeof msg.method === 'string') {
      return { request: { id: msg.id, method: msg.method, params: msg.params ?? {} } };
    }
    if (hasId) {
      const p = this.pending.get(Number(msg.id));
      this.pending.delete(Number(msg.id));
      if (msg.error) p?.reject(new Error(String(msg.error.message ?? 'Permintaan JSON-RPC gagal')));
      else p?.resolve(msg.result ?? {});
      return {};
    }
    if (typeof msg.method === 'string') return { notification: { method: msg.method, params: msg.params ?? {} } };
    return {};
  }
}

/** Kanal driver JSON-RPC ke dunia luar (stdin CLI, stream UI, modal HITL). */
export interface RpcDriverIo {
  /** Satu pesan JSON-RPC (tanpa baris baru) ke stdin CLI. */
  write: (line: string) => void;
  /** Menutup stdin: CLI keluar setelah giliran selesai. */
  close: () => void;
  /** Event UI yang lahir di luar baris stdout (mis. id sesi, kegagalan handshake). */
  emit: (events: UiAgentEvent[]) => void;
  /** Meminta keputusan pengguna (modal HITL); `true` = izinkan. */
  ask: (req: { requestId: string; toolName: string; input: Record<string, unknown> }) => Promise<boolean>;
}

export interface RpcDriver {
  /** Handshake + memulai giliran; dipanggil setelah proses CLI berjalan. */
  start: () => Promise<void>;
  /** Pengganti parser NDJSON untuk sesi ini (baris stdout/stderr → event UI). */
  parse: StreamParser;
}

/** `{type:"localImage"}` / `resource_link` butuh path absolut; URI berkas Windows memakai garis miring. */
export function fileUri(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return encodeURI(`file:///${normalized.replace(/^\/+/, '')}`);
}
