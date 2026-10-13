/**
 * streamParsers.ts
 * Menerjemahkan baris NDJSON dari 4 CLI agen menjadi event UI seragam (UiAgentEvent).
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
    }
  | { kind: 'file_change'; path: string }
  | { kind: 'usage'; inputTokens: number; outputTokens: number; costUsd?: number }
  | { kind: 'notice'; level: 'info' | 'warn' | 'error'; message: string }
  | { kind: 'log'; line: string }
  | { kind: 'done'; ok: boolean; summary?: string };

export type StreamParser = (line: string) => UiAgentEvent[];

type Json = Record<string, any>;

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

/** Claude Code: `claude -p --output-format stream-json --verbose`. */
function createClaudeParser(): StreamParser {
  const toolNames = new Map<string, string>();
  return (line) => {
    const o = JSON.parse(line) as Json;
    const out: UiAgentEvent[] = [];
    if (o.type === 'system' && o.subtype === 'init' && o.session_id) {
      out.push({ kind: 'session', cliSessionId: o.session_id, model: o.model });
    } else if (o.type === 'assistant') {
      for (const block of o.message?.content ?? []) {
        if (block.type === 'text' && block.text) out.push({ kind: 'text', delta: block.text });
        else if (block.type === 'thinking' && block.thinking) out.push({ kind: 'thinking', delta: block.thinking });
        else if (block.type === 'tool_use') {
          toolNames.set(block.id, block.name);
          out.push({ kind: 'tool', id: block.id, name: block.name, input: block.input ?? {}, status: 'running' });
          if (FILE_TOOLS.claude.includes(block.name)) {
            const path = block.input?.file_path ?? block.input?.notebook_path;
            if (path) out.push({ kind: 'file_change', path });
          }
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
      }
    } else if (o.type === 'result') {
      const u = o.usage ?? {};
      out.push({
        kind: 'usage',
        inputTokens: num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens),
        outputTokens: num(u.output_tokens),
        costUsd: typeof o.total_cost_usd === 'number' ? o.total_cost_usd : undefined,
      });
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
      const path = state.input?.filePath;
      if (status === 'done' && path && FILE_TOOLS.opencode.includes(part.tool)) {
        out.push({ kind: 'file_change', path });
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
        emittedText = true;
        out.push({ kind: 'text', delta: s.text_delta });
      } else if (s.step_type === 'tool') {
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
      if (denied.length > 0) {
        const names = denied.map((d) => d.display_name ?? d.action).join(', ');
        out.push({
          kind: 'notice',
          level: 'warn',
          message: `Aksi ditolak di mode aman: ${names}. Buka sesi ini di Terminal untuk menyetujuinya secara interaktif.`,
        });
      }
      out.push({ kind: 'done', ok: r.status === 'SUCCESS' });
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
