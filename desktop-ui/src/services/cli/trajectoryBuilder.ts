/**
 * trajectoryBuilder.ts
 * Mengubah UiAgentEvent (thinking/tool/log/usage) menjadi langkah timeline kronologis di pesan agen:
 * blok penalaran, baca berkas, pencarian, perintah terminal, edit berkas, dan tool lain.
 * Modul murni (tanpa React/Tauri) agar bisa diuji dengan `node --test`. Spesifikasi: specs/agent-protocols.md §3.
 */
import type { AgentUsage, CodeEditChunk, MessageRecord, StepStatus, TrajectoryStep } from '../../types/database.ts';
import type { UiAgentEvent } from './streamParsers.ts';

type ToolEvent = Extract<UiAgentEvent, { kind: 'tool' }>;

const COMMAND_TOOLS = ['shell', 'bash', 'run_command', 'powershell', 'run_terminal_command', 'command'];
const READ_TOOLS = ['read', 'view_file', 'read_file', 'view_file_outline', 'view_code_item', 'notebookread'];
const SEARCH_TOOLS = ['grep', 'glob', 'search', 'grep_search', 'find_by_name', 'codebase_search', 'list_dir', 'ls', 'list'];
const EDIT_TOOLS = [
  'write', 'edit', 'multiedit', 'notebookedit', 'patch',
  'write_to_file', 'replace_file_content', 'multi_replace_file_content', 'edit_file',
];
/** Batas cuplikan keluaran tool yang disimpan (riwayat tetap ringan). */
const MAX_OUTPUT_CHARS = 4000;
const MAX_LOG_LINES = 200;

export function isEditTool(name: string): boolean {
  return EDIT_TOOLS.includes(name.toLowerCase());
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);
}

function baseName(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() || p;
}

/** Path berkas dari argumen tool lintas CLI (claude, opencode, antigravity). */
export function toolFilePath(input: Record<string, unknown>): string {
  return str(input.file_path ?? input.filePath ?? input.TargetFile ?? input.AbsolutePath ?? input.notebook_path ?? input.path);
}

function truncate(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (${text.length - MAX_OUTPUT_CHARS} karakter dipotong)` : text;
}

/** Langkah timeline awal untuk satu panggilan tool. */
export function toolStep(ev: ToolEvent, now: number): TrajectoryStep {
  const name = ev.name.toLowerCase();
  const input = (ev.input || {}) as Record<string, unknown>;
  const common = { toolId: ev.id, toolName: ev.name, status: ev.status, startedAt: now, output: truncate(ev.output) };
  if (COMMAND_TOOLS.includes(name)) {
    const command = str(input.command ?? input.CommandLine ?? input.cmd);
    return { ...common, type: 'command', label: command || ev.name, command, detail: str(input.description) || undefined };
  }
  if (READ_TOOLS.includes(name)) {
    const file = toolFilePath(input) || ev.name;
    const range = input.offset != null || input.StartLine != null
      ? `#L${str(input.offset ?? input.StartLine)}${input.limit != null ? `+${str(input.limit)}` : input.EndLine != null ? `-${str(input.EndLine)}` : ''}`
      : undefined;
    return { ...common, type: 'analyzed', label: file, file: baseName(file), lineRange: range };
  }
  if (SEARCH_TOOLS.includes(name)) {
    const pattern = str(input.pattern ?? input.Query ?? input.query ?? input.Pattern);
    const where = str(input.path ?? input.SearchPath ?? input.DirectoryPath ?? input.SearchDirectory);
    const label = pattern ? `"${pattern}"${where ? ` di ${baseName(where)}` : ''}` : where || ev.name;
    return { ...common, type: 'explored', label, detail: ev.name };
  }
  if (isEditTool(name)) {
    const file = toolFilePath(input);
    return { ...common, type: 'edited', label: file ? baseName(file) : ev.name, file: file || undefined };
  }
  const detail = str(input.url ?? input.Url ?? input.query ?? input.description ?? input.prompt).slice(0, 200);
  return { ...common, type: 'tool', label: ev.name, detail: detail || undefined };
}

/** Menutup langkah penalaran yang masih berjalan saat langkah lain dimulai. */
function closeThoughts(steps: TrajectoryStep[], now: number): TrajectoryStep[] {
  return steps.map((s) => (s.type === 'thought' && s.status === 'running' ? { ...s, status: 'done', endedAt: now } : s));
}

/** Menambahkan potongan penalaran ke blok terakhir (streaming) atau membuka blok baru. */
export function appendThinking(steps: TrajectoryStep[], delta: string, streamingDeltas: boolean, now: number): TrajectoryStep[] {
  const last = steps[steps.length - 1];
  if (last && last.type === 'thought' && last.status === 'running') {
    const sep = streamingDeltas ? '' : '\n\n';
    return [...steps.slice(0, -1), { ...last, thoughtContent: `${last.thoughtContent || ''}${sep}${delta}` }];
  }
  return [...steps, { type: 'thought', label: 'Penalaran', thoughtContent: delta.replace(/^\n+/, ''), status: 'running', startedAt: now }];
}

/** Menyisipkan langkah tool baru atau memperbarui langkah dengan `toolId` yang sama (running → done/error). */
export function applyToolEvent(steps: TrajectoryStep[], ev: ToolEvent, now: number): TrajectoryStep[] {
  const closed = closeThoughts(steps, now);
  const index = closed.findIndex((s) => s.toolId === ev.id);
  if (index < 0) return [...closed, toolStep(ev, now)];
  const prev = closed[index];
  const status: StepStatus = ev.status;
  const updated: TrajectoryStep = {
    ...prev,
    status,
    output: truncate(ev.output) ?? prev.output,
    endedAt: status === 'running' ? prev.endedAt : now,
  };
  return closed.map((s, i) => (i === index ? updated : s));
}

/** Menempelkan diff git ke langkah "edited" berkas yang sama, atau menambah langkah baru (mis. Codex). */
export function attachDiffToSteps(steps: TrajectoryStep[] = [], chunk: CodeEditChunk): TrajectoryStep[] {
  const patch = { label: chunk.relativePath, additions: chunk.additions, deletions: chunk.deletions, diff: chunk };
  const index = steps.findIndex((s) => s.type === 'edited' && (s.diff?.file === chunk.file || s.file === chunk.file));
  if (index >= 0) return steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
  return [...steps, { type: 'edited', file: chunk.file, status: 'done', ...patch }];
}

/** Menutup semua langkah yang masih berjalan saat sesi selesai. */
export function finalizeSteps(steps: TrajectoryStep[] = [], ok: boolean, now: number): TrajectoryStep[] {
  return steps.map((s) => (s.status === 'running' ? { ...s, status: ok || s.type === 'thought' ? 'done' : 'error', endedAt: now } : s));
}

export function appendLog(logs: string[] = [], line: string): string[] {
  const next = [...logs, line];
  return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
}

/** OpenCode melaporkan token per langkah: dijumlahkan; CLI lain sekali di akhir. */
export function addUsage(prev: AgentUsage | undefined, ev: Extract<UiAgentEvent, { kind: 'usage' }>): AgentUsage {
  const cost = (prev?.costUsd ?? 0) + (ev.costUsd ?? 0);
  const credits = (prev?.credits ?? 0) + (ev.credits ?? 0);
  return {
    inputTokens: (prev?.inputTokens ?? 0) + ev.inputTokens,
    outputTokens: (prev?.outputTokens ?? 0) + ev.outputTokens,
    costUsd: cost > 0 ? cost : undefined,
    // Kunci hanya ada bila CLI melaporkan kredit, agar bentuk usage agen lain tidak berubah
    ...(credits > 0 ? { credits } : {}),
  };
}

/** Status akhir pesan saat proses CLI berakhir (status yang sudah final — mis. dihentikan — dipertahankan). */
export function finalizeMessage(msg: MessageRecord, exitCode: number, now: number): MessageRecord {
  const ok = exitCode === 0 && msg.status !== 'error';
  return {
    ...msg,
    status: msg.status === 'running' || !msg.status ? (ok ? 'done' : 'error') : msg.status,
    finishedAt: msg.finishedAt ?? now,
    trajectory: finalizeSteps(msg.trajectory, ok, now),
  };
}
