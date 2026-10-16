/**
 * opencodeAcp.ts
 * Driver Chat GUI untuk `opencode acp` (Agent Client Protocol, JSON-RPC stdio) di mode aman: permintaan
 * `session/request_permission` dijawab lewat modal HITL (`opencode run` selalu menolaknya otomatis).
 * Update `session/update` memakai pemetaan ACP yang sama dengan Kiro (`createStreamParser('kiro')`).
 * Protokol diverifikasi dari opencode 1.19 (16 Okt 2026). Spesifikasi: specs/agent-protocols.md §7.
 */
import { fileUri, JsonRpcPeer, type RpcDriver, type RpcDriverIo } from './jsonRpcPeer.ts';
import { USER_REJECTION_MESSAGE } from './permissionRules.ts';
import { createStreamParser, type UiAgentEvent } from './streamParsers.ts';

type Json = Record<string, any>;

export interface OpencodeAcpOptions {
  cwd: string;
  prompt: string;
  /** `provider/model`; kosong = model bawaan OpenCode. */
  modelId?: string;
  /** Sesi OpenCode yang dilanjutkan (`session/load`). */
  sessionId?: string;
  /** Lampiran (gambar & dokumen) sebagai `resource_link`. */
  filePaths?: string[];
}

/** Jenis tool ACP → nama tool untuk modal & aturan "selalu izinkan". */
const KIND_TOOL: Record<string, string> = { execute: 'bash', edit: 'edit', delete: 'edit', move: 'edit', fetch: 'webfetch' };

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function createOpencodeAcpDriver(o: OpencodeAcpOptions, io: RpcDriverIo): RpcDriver {
  const peer = new JsonRpcPeer(io.write);
  const acpUpdates = createStreamParser('kiro');
  /** Tool yang ditolak pengguna: keluarannya diganti pesan penolakan Soraja (bukan "gagal"). */
  const rejected = new Set<string>();
  /** `session/load` memutar ulang riwayat lewat `session/update`; diabaikan sampai sesi siap. */
  let ready = false;
  let finished = false;
  let thought = '';

  const flushThought = (): UiAgentEvent[] => {
    if (!thought.trim()) return [];
    const ev: UiAgentEvent = { kind: 'thinking', delta: thought };
    thought = '';
    return [ev];
  };

  const finish = (events: UiAgentEvent[]) => {
    if (finished) return;
    finished = true;
    io.emit([...flushThought(), ...events]);
    io.close();
  };

  const onUpdate = (update: Json): UiAgentEvent[] => {
    // Potongan penalaran digabung menjadi satu blok (reducer memisah tiap event OpenCode dengan baris kosong).
    if (update.sessionUpdate === 'agent_thought_chunk') {
      thought += update.content?.text ?? '';
      return [];
    }
    const events = [...flushThought(), ...acpUpdates(JSON.stringify({ type: 'sessionUpdate', data: { update } }))];
    return events.map((ev) =>
      ev.kind === 'tool' && rejected.has(ev.id) && ev.status === 'error' ? { ...ev, output: USER_REJECTION_MESSAGE } : ev
    );
  };

  const onPermission = async (id: number | string, params: Json) => {
    const call = (params.toolCall ?? {}) as Json;
    const options = (params.options ?? []) as Json[];
    const toolId = String(call.toolCallId ?? id);
    const toolName = KIND_TOOL[call.kind] ?? String(call.title ?? call.kind ?? 'tool');
    const input = call.rawInput && typeof call.rawInput === 'object' ? call.rawInput : { title: call.title };
    const approved = await io.ask({ requestId: `acp-${toolId}`, toolName, input });
    if (!approved) rejected.add(toolId);
    // Aturan "selalu" dikelola Soraja; ke OpenCode selalu dijawab "sekali".
    const option = options.find((opt) => opt.kind === (approved ? 'allow_once' : 'reject_once'));
    peer.reply(id, { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } });
  };

  const start = async () => {
    try {
      await peer.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      });
      let sessionId = o.sessionId;
      if (sessionId) await peer.request('session/load', { sessionId, cwd: o.cwd, mcpServers: [] });
      else sessionId = String((await peer.request('session/new', { cwd: o.cwd, mcpServers: [] })).sessionId ?? '');
      ready = true;
      io.emit([{ kind: 'session', cliSessionId: sessionId }]);
      if (o.modelId) {
        await peer.request('session/set_model', { sessionId, modelId: o.modelId }).catch(() =>
          io.emit([{ kind: 'notice', level: 'warn', message: `Model ${o.modelId} tidak bisa dipilih lewat ACP; memakai model bawaan OpenCode.` }])
        );
      }
      const links = (o.filePaths ?? []).map((path) => ({
        type: 'resource_link',
        uri: fileUri(path),
        name: path.split(/[\\/]/).pop() || path,
      }));
      const res = await peer.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: o.prompt }, ...links] });
      const ok = res.stopReason !== 'refusal' && res.stopReason !== 'cancelled';
      finish([
        { kind: 'usage', inputTokens: num(res.usage?.inputTokens), outputTokens: num(res.usage?.outputTokens) },
        { kind: 'done', ok, summary: ok ? undefined : `OpenCode berhenti (${res.stopReason}).` },
      ]);
    } catch (err) {
      finish([{ kind: 'done', ok: false, summary: `OpenCode ACP: ${err instanceof Error ? err.message : String(err)}` }]);
    }
  };

  const parse = (rawLine: string): UiAgentEvent[] => {
    const line = rawLine.trim();
    if (!line) return [];
    let msg: Json;
    try {
      msg = JSON.parse(line);
    } catch {
      return [{ kind: 'log', line }];
    }
    const incoming = peer.handle(msg);
    if (incoming.request) {
      const { id, method, params } = incoming.request;
      if (method === 'session/request_permission') void onPermission(id, params);
      else peer.replyError(id, `Permintaan ${method} tidak didukung di Chat GUI Soraja.`);
      return [];
    }
    const n = incoming.notification;
    if (!n || n.method !== 'session/update' || !ready || finished) return [];
    return onUpdate(n.params.update ?? {});
  };

  return { start, parse };
}
