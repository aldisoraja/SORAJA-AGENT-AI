/**
 * codexAppServer.ts
 * Driver Chat GUI untuk `codex app-server` (JSON-RPC stdio) di mode aman: perintah shell ditanyakan lewat
 * modal HITL, perintah baca/cari dan edit berkas diizinkan otomatis (setara mode aman agen lain).
 * Protokol diverifikasi dari codex-cli 0.163 (`codex app-server generate-ts`, 16 Okt 2026).
 * Spesifikasi: specs/agent-protocols.md §7. Modul murni (IO lewat `RpcDriverIo`).
 */
import type { ChatEffort } from './chatPrompt.ts';
import { JsonRpcPeer, type RpcDriver, type RpcDriverIo } from './jsonRpcPeer.ts';
import { USER_REJECTION_MESSAGE } from './permissionRules.ts';
import type { UiAgentEvent } from './streamParsers.ts';

type Json = Record<string, any>;

export interface CodexRpcOptions {
  cwd: string;
  prompt: string;
  modelId?: string;
  effort?: ChatEffort;
  /** Aturan bahasa + Chat GUI (setara `-c developer_instructions` di `codex exec`). */
  developerInstructions?: string;
  /** Thread yang dilanjutkan (resume). */
  threadId?: string;
  imagePaths?: string[];
}

/** Aksi perintah yang hanya membaca/mencari: dijalankan tanpa bertanya (Codex menandainya lewat `commandActions`). */
const READ_ONLY_ACTIONS = ['read', 'listFiles', 'search'];

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Perintah yang ditampilkan: tanpa pembungkus `powershell.exe -Command '…'` yang ditambahkan Codex di Windows. */
export function codexDisplayCommand(command: unknown, actions: Json[] = []): string {
  if (actions.length === 1 && typeof actions[0]?.command === 'string') return actions[0].command;
  const raw = typeof command === 'string' ? command : '';
  const wrapped = raw.match(/-Command '([\s\S]*)'$/);
  return wrapped ? wrapped[1].replace(/''/g, "'") : raw;
}

export function createCodexAppServerDriver(o: CodexRpcOptions, io: RpcDriverIo): RpcDriver {
  const peer = new JsonRpcPeer(io.write);
  let messageCount = 0;
  let finished = false;
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  const finish = (events: UiAgentEvent[]) => {
    if (finished) return;
    finished = true;
    io.emit(events);
    io.close();
  };

  const itemEvents = (item: Json, completed: boolean): UiAgentEvent[] => {
    switch (item.type) {
      case 'agentMessage':
        return completed && item.text ? [{ kind: 'text', delta: (messageCount++ > 0 ? '\n\n' : '') + item.text }] : [];
      case 'reasoning': {
        const text = [...(item.summary ?? []), ...(item.content ?? [])].filter(Boolean).join('\n\n');
        return completed && text ? [{ kind: 'thinking', delta: text }] : [];
      }
      case 'commandExecution': {
        const declined = item.status === 'declined';
        const failed = item.status === 'failed' || (typeof item.exitCode === 'number' && item.exitCode !== 0);
        return [{
          kind: 'tool',
          id: item.id,
          name: 'shell',
          input: { command: codexDisplayCommand(item.command, item.commandActions) },
          status: !completed ? 'running' : declined || failed ? 'error' : 'done',
          output: !completed ? undefined : declined ? USER_REJECTION_MESSAGE : (item.aggregatedOutput ?? undefined),
        }];
      }
      case 'fileChange':
        return completed && item.status === 'completed'
          ? (item.changes ?? []).filter((c: Json) => c?.path).map((c: Json) => ({ kind: 'file_change', path: c.path }))
          : [];
      case 'mcpToolCall':
        return [{
          kind: 'tool',
          id: item.id,
          name: [item.server, item.tool].filter(Boolean).join('.') || 'mcp',
          input: item.arguments ?? {},
          status: !completed ? 'running' : item.status === 'failed' ? 'error' : 'done',
        }];
      case 'webSearch':
        return [{ kind: 'tool', id: item.id, name: 'web_search', input: { query: item.query }, status: completed ? 'done' : 'running' }];
      default:
        return [];
    }
  };

  const onRequest = async (req: { id: number | string; method: string; params: Json }) => {
    const p = req.params;
    if (req.method === 'item/fileChange/requestApproval') {
      peer.reply(req.id, { decision: 'accept' });
      return;
    }
    if (req.method !== 'item/commandExecution/requestApproval') {
      peer.replyError(req.id, `Permintaan ${req.method} tidak didukung di Chat GUI Soraja.`);
      return;
    }
    const actions = (p.commandActions ?? []) as Json[];
    if (actions.length > 0 && actions.every((a) => READ_ONLY_ACTIONS.includes(a?.type))) {
      peer.reply(req.id, { decision: 'accept' });
      return;
    }
    const input: Record<string, unknown> = { command: codexDisplayCommand(p.command, actions) };
    if (p.reason) input.description = p.reason;
    const approved = await io.ask({ requestId: `codex-${p.itemId ?? req.id}`, toolName: 'shell', input });
    peer.reply(req.id, { decision: approved ? 'accept' : 'decline' });
  };

  const start = async () => {
    try {
      await peer.request('initialize', { clientInfo: { name: 'soraja', title: 'Soraja', version: '0.1.0' }, capabilities: null });
      peer.notify('initialized');
      // `untrusted` = setiap perintah selain yang dikenal aman meminta izin; sandbox Windows `workspace-write`
      // memblokir bahkan `Set-Content`, jadi perintah yang sudah disetujui pengguna berjalan tanpa sandbox.
      const thread = {
        cwd: o.cwd,
        approvalPolicy: 'untrusted',
        sandbox: 'danger-full-access',
        model: o.modelId ?? null,
        developerInstructions: o.developerInstructions || null,
      };
      const res = o.threadId
        ? await peer.request('thread/resume', { threadId: o.threadId, excludeTurns: true, ...thread })
        : await peer.request('thread/start', thread);
      const threadId = String(res.thread?.id ?? o.threadId ?? '');
      if (threadId) io.emit([{ kind: 'session', cliSessionId: threadId }]);
      const images = (o.imagePaths ?? []).map((path) => ({ type: 'localImage', path }));
      await peer.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: o.prompt, text_elements: [] }, ...images],
        effort: o.effort ? (o.effort === 'max' ? 'xhigh' : o.effort) : null,
      });
    } catch (err) {
      finish([{ kind: 'done', ok: false, summary: `Codex app-server: ${err instanceof Error ? err.message : String(err)}` }]);
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
      void onRequest(incoming.request);
      return [];
    }
    const n = incoming.notification;
    if (!n) return [];
    switch (n.method) {
      case 'item/started':
      case 'item/completed':
        return n.params.item ? itemEvents(n.params.item, n.method === 'item/completed') : [];
      case 'thread/tokenUsage/updated': {
        // `last` = pemakaian satu panggilan model; dijumlahkan menjadi pemakaian giliran ini.
        // `cachedInputTokens` adalah bagian dari `inputTokens` (konvensi OpenAI) → dipisah seperti `turn.completed` exec.
        const last = n.params.tokenUsage?.last ?? {};
        const cached = Math.min(num(last.cachedInputTokens), num(last.inputTokens));
        usage.inputTokens += num(last.inputTokens) - cached;
        usage.cacheReadTokens += cached;
        usage.outputTokens += num(last.outputTokens);
        return [];
      }
      case 'error':
        return n.params.willRetry ? [] : [{ kind: 'notice', level: 'error', message: String(n.params.error?.message ?? 'Codex error') }];
      case 'turn/completed': {
        const turn = n.params.turn ?? {};
        const events: UiAgentEvent[] = [
          { kind: 'usage', ...usage },
          { kind: 'done', ok: turn.status === 'completed', summary: turn.error?.message ?? undefined },
        ];
        finished = true;
        io.close();
        return events;
      }
      default:
        return [];
    }
  };

  return { start, parse };
}
