/**
 * streamParsers.ts
 * Menerjemahkan baris NDJSON dari 6 CLI agen menjadi event UI seragam (UiAgentEvent).
 * Skema diverifikasi dari output nyata — fixture ada di `desktop-ui/tests/fixtures/*.ndjson`.
 * Spesifikasi: specs/agent-protocols.md §3. Modul murni (tanpa import runtime).
 */

export type UiAgentEvent =
  | { kind: 'session'; cliSessionId: string; model?: string }
  | { kind: 'text'; delta: string }
  | { kind: 'thinking'; delta: string }
  | {
      kind: 'tool';
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: 'running' | 'done' | 'error';
      output?: string;
      /** Jenis tool dari CLI bila tersedia (ACP Kiro: read/edit/search/execute/fetch/…). */
      category?: string;
    }
  | { kind: 'file_change'; path: string }
  /** Aksi ditolak kebijakan izin: per id tool (Claude) atau per jenis aksi (Antigravity: `command`). */
  | { kind: 'denied'; toolId?: string; action?: string }
  | { kind: 'usage'; inputTokens: number; outputTokens: number; costUsd?: number; credits?: number }
  | { kind: 'notice'; level: 'info' | 'warn' | 'error'; message: string }
  | { kind: 'log'; line: string }
  | { kind: 'done'; ok: boolean; summary?: string };

export type StreamParser = (line: string) => UiAgentEvent[];

type Json = Record<string, any>;

/** Awal notice aksi yang ditolak kebijakan izin CLI (dikenali reducer untuk penolakan oleh pengguna). */
export const DENIED_NOTICE_PREFIX = 'Aksi ditolak di mode aman';

function deniedNotice(names: string): string {
  return `${DENIED_NOTICE_PREFIX}: ${names}. Pilih **Izinkan & ulangi** di bawah untuk mengizinkannya, atau buka sesi ini di Terminal.`;
}

const FILE_TOOLS: Record<string, string[]> = {
  claude: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'],
  opencode: ['write', 'edit', 'patch', 'multiedit'],
  antigravity: ['write_to_file', 'replace_file_content', 'multi_replace_file_content', 'edit_file'],
};

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? v : v?.text ?? '')).join('');
  }
  return value == null ? '' : JSON.stringify(value);
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Claude Code: `claude -p --output-format stream-json --verbose`.
 * Tiap blok `text` adalah paragraf utuh (dipisah baris kosong). Pesan sub-agen (`parent_tool_use_id`)
 * hanya menyumbang langkah tool, bukan teks jawaban. `file_change` dikirim setelah tool edit berhasil.
 */
function createClaudeParser(): StreamParser {
  const toolNames = new Map<string, string>();
  const editPaths = new Map<string, string>();
  let textCount = 0;
  return (line) => {
    const o = JSON.parse(line) as Json;
    const out: UiAgentEvent[] = [];
    const nested = !!o.parent_tool_use_id;
    if (o.type === 'system' && o.subtype === 'init' && o.session_id) {
      out.push({ kind: 'session', cliSessionId: o.session_id, model: o.model });
    } else if (o.type === 'assistant') {
      for (const block of o.message?.content ?? []) {
        if (block.type === 'text' && block.text && !nested) {
          out.push({ kind: 'text', delta: (textCount++ > 0 ? '\n\n' : '') + block.text });
        } else if (block.type === 'thinking' && block.thinking && !nested) {
          out.push({ kind: 'thinking', delta: block.thinking });
        } else if (block.type === 'tool_use') {
          toolNames.set(block.id, block.name);
          out.push({ kind: 'tool', id: block.id, name: block.name, input: block.input ?? {}, status: 'running' });
          const path = block.input?.file_path ?? block.input?.notebook_path;
          if (FILE_TOOLS.claude.includes(block.name) && path) editPaths.set(block.id, path);
        }
      }
    } else if (o.type === 'user') {
      for (const block of o.message?.content ?? []) {
        if (block.type !== 'tool_result') continue;
        out.push({
          kind: 'tool',
          id: block.tool_use_id,
          name: toolNames.get(block.tool_use_id) ?? 'tool',
          input: {},
          status: block.is_error ? 'error' : 'done',
          output: toText(block.content),
        });
        const path = editPaths.get(block.tool_use_id);
        editPaths.delete(block.tool_use_id);
        if (path && !block.is_error) out.push({ kind: 'file_change', path });
      }
    } else if (o.type === 'result') {
      const u = o.usage ?? {};
      out.push({
        kind: 'usage',
        inputTokens: num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens),
        outputTokens: num(u.output_tokens),
        costUsd: typeof o.total_cost_usd === 'number' ? o.total_cost_usd : undefined,
      });
      const denials = (Array.isArray(o.permission_denials) ? o.permission_denials : []) as Json[];
      for (const d of denials) out.push({ kind: 'denied', toolId: d.tool_use_id, action: d.tool_name });
      if (denials.length > 0) {
        const names = [...new Set(denials.map((d) => String(d.tool_name ?? 'tool')))].join(', ');
        out.push({
          kind: 'notice',
          level: 'warn',
          message: deniedNotice(names),
        });
      }
      out.push({ kind: 'done', ok: !o.is_error, summary: o.is_error ? toText(o.result) : undefined });
    }
    return out;
  };
}

/** Codex: `codex exec --json`. */
function createCodexParser(): StreamParser {
  let messageCount = 0;
  return (line) => {
    const o = JSON.parse(line) as Json;
    const out: UiAgentEvent[] = [];
    const item = o.item as Json | undefined;
    if (o.type === 'thread.started' && o.thread_id) {
      out.push({ kind: 'session', cliSessionId: o.thread_id });
    } else if ((o.type === 'item.started' || o.type === 'item.completed') && item) {
      const completed = o.type === 'item.completed';
      if (item.type === 'agent_message' && completed) {
        out.push({ kind: 'text', delta: (messageCount++ > 0 ? '\n\n' : '') + toText(item.text) });
      } else if (item.type === 'reasoning' && completed) {
        out.push({ kind: 'thinking', delta: toText(item.text) });
      } else if (item.type === 'command_execution') {
        const failed = completed && typeof item.exit_code === 'number' && item.exit_code !== 0;
        out.push({
          kind: 'tool',
          id: item.id,
          name: 'shell',
          input: { command: item.command },
          status: !completed ? 'running' : failed ? 'error' : 'done',
          output: completed ? toText(item.aggregated_output) : undefined,
        });
      } else if (item.type === 'mcp_tool_call') {
        out.push({
          kind: 'tool',
          id: item.id,
          name: [item.server, item.tool].filter(Boolean).join('.') || 'mcp',
          input: item.arguments ?? {},
          status: !completed ? 'running' : item.status === 'failed' ? 'error' : 'done',
        });
      } else if (item.type === 'todo_list') {
        out.push({ kind: 'tool', id: item.id, name: 'todo_list', input: { items: item.items ?? [] }, status: completed ? 'done' : 'running' });
      } else if (item.type === 'web_search') {
        out.push({ kind: 'tool', id: item.id, name: 'web_search', input: { query: item.query }, status: completed ? 'done' : 'running' });
      } else if (item.type === 'file_change' && completed) {
        for (const change of item.changes ?? []) {
          if (change?.path) out.push({ kind: 'file_change', path: change.path });
        }
      } else if (item.type === 'error') {
        out.push({ kind: 'notice', level: 'error', message: toText(item.message) });
      }
    } else if (o.type === 'turn.completed') {
      const u = o.usage ?? {};
      out.push({ kind: 'usage', inputTokens: num(u.input_tokens), outputTokens: num(u.output_tokens) });
      out.push({ kind: 'done', ok: true });
    } else if (o.type === 'turn.failed') {
      out.push({ kind: 'done', ok: false, summary: toText(o.error?.message) });
    } else if (o.type === 'error') {
      out.push({ kind: 'notice', level: 'error', message: toText(o.message) });
    }
    return out;
  };
}

/** Path berkas yang diubah tool edit OpenCode; tool `patch` memuat banyak berkas di `patchText`. */
function opencodeEditPaths(input: Json): string[] {
  if (typeof input.filePath === 'string' && input.filePath) return [input.filePath];
  const patch = typeof input.patchText === 'string' ? input.patchText : '';
  return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => m[1].trim());
}

/** OpenCode: `opencode run --format json`. */
function createOpencodeParser(): StreamParser {
  let sessionSent = false;
  let textCount = 0;
  return (line) => {
    const o = JSON.parse(line) as Json;
    const out: UiAgentEvent[] = [];
    const part = (o.part ?? {}) as Json;
    if (!sessionSent && o.sessionID) {
      sessionSent = true;
      out.push({ kind: 'session', cliSessionId: o.sessionID });
    }
    if (o.type === 'text' && part.text) {
      out.push({ kind: 'text', delta: (textCount++ > 0 ? '\n\n' : '') + part.text });
    } else if (o.type === 'reasoning' && part.text) {
      out.push({ kind: 'thinking', delta: part.text });
    } else if (o.type === 'tool_use') {
      const state = (part.state ?? {}) as Json;
      const status = state.status === 'error' ? 'error' : state.status === 'completed' ? 'done' : 'running';
      out.push({
        kind: 'tool',
        id: part.callID ?? part.id,
        name: part.tool ?? 'tool',
        input: state.input ?? {},
        status,
        output: status === 'error' ? toText(state.error) : state.output != null ? toText(state.output) : undefined,
      });
      if (status === 'done' && FILE_TOOLS.opencode.includes(part.tool)) {
        for (const path of opencodeEditPaths(state.input ?? {})) out.push({ kind: 'file_change', path });
      }
    } else if (o.type === 'step_finish') {
      const t = part.tokens ?? {};
      out.push({ kind: 'usage', inputTokens: num(t.input), outputTokens: num(t.output), costUsd: num(part.cost) });
    } else if (o.type === 'error') {
      out.push({ kind: 'notice', level: 'error', message: toText(o.error?.data?.message ?? o.error?.message ?? o.error) });
    }
    return out;
  };
}

/** Antigravity: `agy -p --output-format stream-json`. */
function createAntigravityParser(): StreamParser {
  let emittedText = false;
  /** Teks berlanjut setelah tool → paragraf baru (delta per token tidak membawa pemisah antarblok). */
  let textBreak = false;
  return (line) => {
    const o = JSON.parse(line) as Json;
    const out: UiAgentEvent[] = [];
    if (o.event === 'init' && o.conversation_id) {
      out.push({ kind: 'session', cliSessionId: o.conversation_id });
    } else if (o.event === 'step_update') {
      const s = (o.step_update ?? {}) as Json;
      if (typeof s.thinking_delta === 'string' && s.thinking_delta) {
        out.push({ kind: 'thinking', delta: s.thinking_delta });
      }
      if (s.step_type === 'agent_response' && typeof s.text_delta === 'string' && s.text_delta) {
        out.push({ kind: 'text', delta: (textBreak ? '\n\n' : '') + s.text_delta });
        emittedText = true;
        textBreak = false;
      } else if (s.step_type === 'tool') {
        textBreak = emittedText;
        const name = s.tool_name ?? s.tool_info?.name ?? 'tool';
        const params = (s.tool_info?.parameters ?? {}) as Json;
        const status = s.state === 'DONE' ? 'done' : s.state === 'ACTIVE' ? 'running' : 'error';
        out.push({ kind: 'tool', id: `step-${s.step_index}`, name, input: params, status });
        if (status === 'done' && params.TargetFile && FILE_TOOLS.antigravity.includes(name)) {
          out.push({ kind: 'file_change', path: params.TargetFile });
        }
      }
    } else if (o.event === 'result') {
      const r = (o.result ?? {}) as Json;
      if (!emittedText && r.response) out.push({ kind: 'text', delta: r.response });
      const u = r.usage ?? {};
      out.push({ kind: 'usage', inputTokens: num(u.input_tokens), outputTokens: num(u.output_tokens) });
      const denied = (r.denied_actions ?? []) as Json[];
      for (const d of denied) out.push({ kind: 'denied', action: String(d.action ?? '') });
      if (denied.length > 0) {
        const names = denied.map((d) => d.display_name ?? d.action).join(', ');
        out.push({
          kind: 'notice',
          level: 'warn',
          message: deniedNotice(names),
        });
      }
      out.push({ kind: 'done', ok: r.status === 'SUCCESS' });
    }
    return out;
  };
}

/**
 * Kiro: `kiro-cli chat --no-interactive --output-format stream-json --agent-engine v3`.
 * Amplop `{type, data}`; isi `sessionUpdate` mengikuti ACP (`data.update.sessionUpdate`).
 * Sumber: kiro.dev/docs/cli/headless + output nyata kiro-cli 2.29 (belum ada fixture lokal).
 */
function createKiroParser(): StreamParser {
  let sessionSent = false;
  let emittedText = false;
  /** Teks berlanjut setelah tool → paragraf baru (bug "…fungsi lain.Sepertinya…"). */
  let textBreak = false;
  const toolNames = new Map<string, string>();
  const toolInputs = new Map<string, Record<string, unknown>>();
  const toolKinds = new Map<string, string>();
  const toolStatus = (s: unknown): 'running' | 'done' | 'error' =>
    s === 'completed' ? 'done' : s === 'failed' ? 'error' : 'running';
  return (line) => {
    const o = JSON.parse(line) as Json;
    const d = (o.data ?? {}) as Json;
    const out: UiAgentEvent[] = [];
    const sid = d.sessionId ?? d.session_id;
    if (!sessionSent && typeof sid === 'string' && sid) {
      sessionSent = true;
      out.push({ kind: 'session', cliSessionId: sid, model: d.model });
    }
    if (o.type === 'sessionUpdate') {
      const u = (d.update ?? {}) as Json;
      const kind = u.sessionUpdate;
      const summaries = u._meta?.kiro?.promptTurnSummaries;
      if (Array.isArray(summaries)) {
        // Dikirim sekali per giliran (`kind: "turn_completion"`); satuan nyata dari CLI, bukan perkiraan.
        const credits = summaries
          .filter((s: Json) => s?.unit === 'credit')
          .reduce((sum: number, s: Json) => sum + num(s.usage), 0);
        if (credits > 0) out.push({ kind: 'usage', inputTokens: 0, outputTokens: 0, credits });
      }
      if (kind === 'agent_message_chunk' && u.content?.text) {
        out.push({ kind: 'text', delta: (textBreak ? '\n\n' : '') + u.content.text });
        emittedText = true;
        textBreak = false;
      } else if (kind === 'agent_thought_chunk' && u.content?.text) {
        out.push({ kind: 'thinking', delta: u.content.text });
      } else if (kind === 'plan' && Array.isArray(u.entries)) {
        // Rencana ACP dikirim utuh tiap kali berubah → satu langkah "plan" yang diperbarui.
        const done = u.entries.every((e: Json) => e?.status === 'completed');
        out.push({ kind: 'tool', id: 'kiro-plan', name: 'plan', input: { entries: u.entries }, status: done ? 'done' : 'running' });
      } else if (kind === 'tool_call' || kind === 'tool_call_update') {
        textBreak = emittedText;
        const id = String(u.toolCallId ?? `tool-${toolNames.size}`);
        // Update sering tanpa `title`: nama dari `tool_call` awal dipertahankan, `kind` hanya cadangan.
        if (u.title) toolNames.set(id, String(u.title));
        else if (u.kind && !toolNames.has(id)) toolNames.set(id, String(u.kind));
        if (u.kind) toolKinds.set(id, String(u.kind));
        if (u.rawInput && typeof u.rawInput === 'object') toolInputs.set(id, u.rawInput);
        const status = toolStatus(u.status);
        const content = Array.isArray(u.content)
          ? u.content.map((c: Json) => c?.content?.text ?? c?.text ?? '').join('')
          : '';
        out.push({
          kind: 'tool',
          id,
          name: toolNames.get(id) ?? 'tool',
          input: toolInputs.get(id) ?? {},
          status,
          output: status === 'running' ? undefined : content || (u.rawOutput != null ? toText(u.rawOutput) : undefined),
          category: toolKinds.get(id),
        });
        const input = (toolInputs.get(id) ?? {}) as Json;
        const path = u.locations?.[0]?.path ?? input.path ?? input.file_path;
        if (status === 'done' && toolKinds.get(id) === 'edit' && typeof path === 'string') out.push({ kind: 'file_change', path });
      }
    } else if (o.type === 'runFinished') {
      if (!emittedText && d.finalText) out.push({ kind: 'text', delta: toText(d.finalText) });
      out.push({ kind: 'done', ok: d.status === 'success', summary: d.status === 'success' ? undefined : toText(d.stopReason) });
    } else if (o.type === 'runError') {
      out.push({ kind: 'done', ok: false, summary: toText(d.message) });
    } else if (typeof o.type === 'string' && /interrupt/i.test(o.type)) {
      out.push({ kind: 'done', ok: false, summary: 'Proses Kiro dihentikan.' });
    }
    return out;
  };
}

const FACTORIES: Record<string, () => StreamParser> = {
  claude: createClaudeParser,
  codex: createCodexParser,
  opencode: createOpencodeParser,
  antigravity: createAntigravityParser,
  agy: createAntigravityParser,
  kiro: createKiroParser,
  'kiro-cli': createKiroParser,
};

/**
 * Membuat parser ber-state untuk satu sesi. Baris non-JSON (mis. log stderr CLI)
 * dikembalikan sebagai event `log` agar tampil di jejak penalaran, bukan di jawaban.
 */
export function createStreamParser(agentId: string): StreamParser {
  const parse = (FACTORIES[agentId] ?? createClaudeParser)();
  return (rawLine) => {
    const line = rawLine.trim();
    if (!line) return [];
    if (!line.startsWith('{')) return [{ kind: 'log', line }];
    try {
      return parse(line);
    } catch {
      return [{ kind: 'log', line }];
    }
  };
}
