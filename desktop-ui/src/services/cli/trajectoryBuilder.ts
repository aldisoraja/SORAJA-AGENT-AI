/**
 * trajectoryBuilder.ts
 * Mengubah UiAgentEvent (thinking/tool/log/usage) menjadi langkah timeline kronologis di pesan agen:
 * blok penalaran, baca berkas, pencarian, web, rencana kerja, perintah terminal, edit berkas, dan tool lain.
 * Modul murni (tanpa React/Tauri) agar bisa diuji dengan `node --test`. Spesifikasi: specs/agent-protocols.md §3.
 */
import type { AgentUsage, CodeEditChunk, MessageRecord, PlanItem, StepStatus, TrajectoryStep } from '../../types/database.ts';
import type { UiAgentEvent } from './streamParsers.ts';

type ToolEvent = Extract<UiAgentEvent, { kind: 'tool' }>;
type DeniedEvent = Extract<UiAgentEvent, { kind: 'denied' }>;
type StepType = TrajectoryStep['type'];

const COMMAND_TOOLS = ['shell', 'bash', 'run_command', 'powershell', 'run_terminal_command', 'command', 'exec_command'];
const READ_TOOLS = ['read', 'view_file', 'read_file', 'view_file_outline', 'view_code_item', 'notebookread'];
const SEARCH_TOOLS = ['grep', 'glob', 'search', 'grep_search', 'find_by_name', 'codebase_search', 'list_dir', 'ls', 'list'];
const WEB_TOOLS = ['webfetch', 'websearch', 'web_search', 'web_fetch', 'read_url_content', 'search_web', 'fetch'];
const PLAN_TOOLS = ['todowrite', 'todo_list', 'update_plan', 'plan'];
const EDIT_TOOLS = [
  'write', 'edit', 'multiedit', 'notebookedit', 'patch',
  'write_to_file', 'replace_file_content', 'multi_replace_file_content', 'edit_file',
];
/** Jenis tool ACP (Kiro) → jenis langkah timeline. */
const CATEGORY_TYPE: Record<string, StepType> = {
  read: 'analyzed', edit: 'edited', delete: 'edited', move: 'edited',
  search: 'explored', execute: 'command', fetch: 'web',
};
/** Keluaran tool yang menandakan aksi ditolak kebijakan izin (bukan gagal dijalankan). */
const DENIED_OUTPUT =
  /requested permissions? to use|haven't granted|BLOCKED by|permission (?:was )?denied by|rejected by (?:the )?user|user rejected this tool|requires approval|ditolak oleh pengguna/i;
/** Penolakan dari modal HITL Soraja (`permission_bridge.rs`): keputusan pengguna, bukan mode aman. */
const USER_REJECTED_OUTPUT = /ditolak oleh pengguna/i;

export function isUserRejection(output?: string): boolean {
  return USER_REJECTED_OUTPUT.test(output || '');
}
/** Batas cuplikan keluaran tool yang disimpan (riwayat tetap ringan). */
const MAX_OUTPUT_CHARS = 4000;
const MAX_LOG_LINES = 200;

export function isEditTool(name: string): boolean {
  return EDIT_TOOLS.includes(name.toLowerCase());
}

function str(v: unknown): string {
  if (Array.isArray(v)) return v.map(str).join(' ');
  return typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);
}

function baseName(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() || p;
}

/** Path yang sama walau beda pemisah, huruf besar/kecil (Windows), atau relatif vs absolut. */
export function samePath(a = '', b = ''): boolean {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`);
}

/** Path berkas dari argumen tool lintas CLI (claude, opencode, antigravity, kiro). */
export function toolFilePath(input: Record<string, unknown>): string {
  return str(input.file_path ?? input.filePath ?? input.TargetFile ?? input.AbsolutePath ?? input.notebook_path ?? input.path);
}

function truncate(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (${text.length - MAX_OUTPUT_CHARS} karakter dipotong)` : text;
}

/** Butir rencana dari TodoWrite (`todos`), Codex (`items`), atau ACP (`entries`). */
export function planItems(input: Record<string, unknown>): PlanItem[] {
  const raw = input.todos ?? input.items ?? input.entries ?? input.plan;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any): PlanItem => {
      const s = String(t?.status ?? '').toLowerCase();
      const status = t?.completed === true || s === 'completed' || s === 'done' ? 'done' : s === 'in_progress' || s === 'active' ? 'active' : 'pending';
      return { text: str(typeof t === 'string' ? t : t?.content ?? t?.text ?? t?.step ?? t?.activeForm).trim(), status };
    })
    .filter((t) => t.text);
}

function stepType(ev: ToolEvent): StepType {
  const name = ev.name.toLowerCase();
  if (PLAN_TOOLS.includes(name)) return 'plan';
  if (ev.category && CATEGORY_TYPE[ev.category]) return CATEGORY_TYPE[ev.category];
  if (COMMAND_TOOLS.includes(name)) return 'command';
  if (READ_TOOLS.includes(name)) return 'analyzed';
  if (SEARCH_TOOLS.includes(name)) return 'explored';
  if (WEB_TOOLS.includes(name)) return 'web';
  if (isEditTool(name)) return 'edited';
  return 'tool';
}

function toolStatus(ev: ToolEvent): StepStatus {
  return ev.status === 'error' && DENIED_OUTPUT.test(ev.output || '') ? 'denied' : ev.status;
}

/** Langkah timeline awal untuk satu panggilan tool. */
export function toolStep(ev: ToolEvent, now: number): TrajectoryStep {
  const input = (ev.input || {}) as Record<string, unknown>;
  const common = { toolId: ev.id, toolName: ev.name, status: toolStatus(ev), startedAt: now, output: truncate(ev.output) };
  switch (stepType(ev)) {
    case 'plan': {
      const todos = planItems(input);
      return { ...common, type: 'plan', label: 'Rencana kerja', todos, count: todos.length };
    }
    case 'command': {
      const command = str(input.command ?? input.CommandLine ?? input.cmd);
      return { ...common, type: 'command', label: command || ev.name, command, detail: str(input.description) || undefined };
    }
    case 'analyzed': {
      const file = toolFilePath(input) || ev.name;
      const range = input.offset != null || input.StartLine != null
        ? `#L${str(input.offset ?? input.StartLine)}${input.limit != null ? `+${str(input.limit)}` : input.EndLine != null ? `-${str(input.EndLine)}` : ''}`
        : undefined;
      return { ...common, type: 'analyzed', label: file, file: baseName(file), lineRange: range };
    }
    case 'explored': {
      const pattern = str(input.pattern ?? input.Query ?? input.query ?? input.Pattern);
      const where = str(input.path ?? input.SearchPath ?? input.DirectoryPath ?? input.SearchDirectory);
      const label = pattern ? `"${pattern}"${where ? ` di ${baseName(where)}` : ''}` : where || ev.name;
      return { ...common, type: 'explored', label, detail: ev.name };
    }
    case 'web': {
      const target = str(input.url ?? input.Url ?? input.query ?? input.Query).slice(0, 300);
      return { ...common, type: 'web', label: target || ev.name, detail: ev.name };
    }
    case 'edited': {
      const file = toolFilePath(input);
      return { ...common, type: 'edited', label: file ? baseName(file) : ev.name, file: file || undefined };
    }
    default: {
      const detail = str(input.description ?? input.url ?? input.Url ?? input.query ?? input.prompt).slice(0, 200);
      return { ...common, type: 'tool', label: ev.name, detail: detail || undefined };
    }
  }
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

/**
 * Menyisipkan langkah tool baru atau memperbarui langkah dengan `toolId` yang sama (running → done/error).
 * Rencana kerja hanya punya satu langkah yang isinya diganti tiap kali agen memperbaruinya.
 */
export function applyToolEvent(steps: TrajectoryStep[], ev: ToolEvent, now: number): TrajectoryStep[] {
  const closed = closeThoughts(steps, now);
  let index = closed.findIndex((s) => s.toolId === ev.id);
  const fresh = toolStep(ev, now);
  if (index < 0 && fresh.type === 'plan') index = closed.findIndex((s) => s.type === 'plan');
  if (index < 0) return [...closed, fresh];

  const prev = closed[index];
  const hasInput = Object.keys(ev.input || {}).length > 0;
  const status: StepStatus = prev.status === 'denied' ? 'denied' : fresh.status ?? ev.status;
  const updated: TrajectoryStep = {
    ...prev,
    // Argumen yang baru lengkap belakangan (mis. OpenCode) melengkapi label/berkas/perintah.
    ...(hasInput ? { label: fresh.label, file: fresh.file ?? prev.file, command: fresh.command ?? prev.command, detail: fresh.detail ?? prev.detail } : {}),
    ...(fresh.type === 'plan' && fresh.todos?.length ? { todos: fresh.todos, count: fresh.todos.length } : {}),
    toolId: ev.id,
    status,
    output: fresh.output ?? prev.output,
    endedAt: status === 'running' ? prev.endedAt : now,
  };
  return closed.map((s, i) => (i === index ? updated : s));
}

/** Jenis langkah yang dimaksud oleh nama aksi yang ditolak (mis. Antigravity `command`, Claude `Bash`). */
function deniedActionType(action = ''): StepType | undefined {
  if (/command|bash|shell|run|powershell/i.test(action)) return 'command';
  if (/write|edit|file|patch/i.test(action)) return 'edited';
  if (/read|view/i.test(action)) return 'analyzed';
  return undefined;
}

/** Menandai langkah sebagai "ditolak": cocok per id tool, atau langkah terakhir dengan jenis aksi yang sama. */
export function markDenied(steps: TrajectoryStep[] = [], ev: DeniedEvent): TrajectoryStep[] {
  let index = ev.toolId ? steps.findIndex((s) => s.toolId === ev.toolId) : -1;
  if (index < 0 && !ev.toolId) {
    const type = deniedActionType(ev.action);
    for (let i = steps.length - 1; i >= 0 && type; i--) {
      if (steps[i].type === type && steps[i].status !== 'denied') {
        index = i;
        break;
      }
    }
  }
  if (index < 0) return steps;
  return steps.map((s, i) => (i === index ? { ...s, status: 'denied', output: s.output || 'Ditolak oleh mode aman.' } : s));
}

/** Memastikan ada langkah "edited" untuk berkas yang dilaporkan berubah (Codex hanya mengirim `file_change`). */
export function applyFileChange(steps: TrajectoryStep[] = [], path: string, now: number): TrajectoryStep[] {
  if (steps.some((s) => s.type === 'edited' && samePath(s.file, path))) return steps;
  // Tool edit tanpa argumen path (mis. OpenCode `patch`) diisi berkas pertamanya, bukan ditambah baris kembar.
  const unnamed = steps.findLastIndex((s) => s.type === 'edited' && !s.file && s.status === 'done');
  if (unnamed >= 0) return steps.map((s, i) => (i === unnamed ? { ...s, file: path, label: baseName(path) } : s));
  return [...closeThoughts(steps, now), { type: 'edited', label: baseName(path), file: path, status: 'done', startedAt: now, endedAt: now }];
}

/**
 * Menempelkan statistik diff git ke semua langkah "edited" berkas yang sama (diff kumulatif).
 * Isi diff disimpan sekali di `MessageRecord.codeEdits`, tidak diduplikasi per langkah.
 */
export function attachDiffToSteps(steps: TrajectoryStep[] = [], chunk: CodeEditChunk): TrajectoryStep[] {
  const patch = { label: chunk.relativePath, additions: chunk.additions, deletions: chunk.deletions };
  const matches = (s: TrajectoryStep) => s.type === 'edited' && s.status !== 'denied' && samePath(s.file ?? s.diff?.file, chunk.file);
  if (steps.some(matches)) return steps.map((s) => (matches(s) ? { ...s, ...patch } : s));
  return [...steps, { type: 'edited', file: chunk.file, status: 'done', ...patch }];
}

/** Menyisipkan/mengganti diff satu berkas di daftar perubahan kode pesan. */
export function upsertCodeEdit(edits: CodeEditChunk[] = [], chunk: CodeEditChunk): CodeEditChunk[] {
  const index = edits.findIndex((e) => samePath(e.file, chunk.file));
  return index < 0 ? [...edits, chunk] : edits.map((e, i) => (i === index ? chunk : e));
}

/** Menghapus diff berkas yang ternyata tidak berubah (mis. edit dibatalkan kembali). */
export function removeCodeEdit(edits: CodeEditChunk[] = [], file: string): CodeEditChunk[] {
  return edits.filter((e) => !samePath(e.file, file));
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
