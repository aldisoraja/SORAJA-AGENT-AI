/**
 * workSummary.ts
 * Helper murni untuk panel "Proses kerja" agen: ringkasan langkah, label aktivitas live, format durasi & token.
 */
import type { ChatReasoningEffort, MessageRecord, TrajectoryStep } from '../../../types/database';

export interface StepCounts {
  thoughts: number;
  reads: number;
  searches: number;
  commands: number;
  edits: number;
  tools: number;
  errors: number;
  additions: number;
  deletions: number;
}

export function countSteps(steps: TrajectoryStep[]): StepCounts {
  const c: StepCounts = { thoughts: 0, reads: 0, searches: 0, commands: 0, edits: 0, tools: 0, errors: 0, additions: 0, deletions: 0 };
  for (const s of steps) {
    if (s.status === 'error') c.errors++;
    if (s.type === 'thought') c.thoughts++;
    else if (s.type === 'analyzed') c.reads++;
    else if (s.type === 'explored') c.searches++;
    else if (s.type === 'command') c.commands++;
    else if (s.type === 'tool') c.tools++;
    else if (s.type === 'edited') {
      c.edits++;
      c.additions += s.additions ?? 0;
      c.deletions += s.deletions ?? 0;
    }
  }
  return c;
}

/** Langkah untuk ditampilkan: pesan lama tanpa langkah "thought" → `reasoning` menjadi blok penalaran pertama. */
export function displaySteps(msg: MessageRecord): TrajectoryStep[] {
  const steps = msg.trajectory || [];
  const reasoning = (msg.reasoning || '').trim();
  if (!reasoning || steps.some((s) => s.type === 'thought' && s.thoughtContent)) return steps;
  return [{ type: 'thought', label: 'Penalaran', thoughtContent: reasoning, status: 'done' }, ...steps];
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} dtk`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m} mnt ${s} dtk` : `${m} mnt`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Kredit (mis. Kiro): 2 desimal, atau 3 desimal bila sangat kecil agar tidak tampil "0". */
export function formatCredits(n: number): string {
  const digits = n < 0.1 ? 3 : 2;
  return `${n.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })} kredit`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (n >= 1000) return `${(n / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} rb`;
  return n.toLocaleString('id-ID');
}

export function baseName(p = ''): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() || p;
}

/** Kalimat aktivitas live untuk header saat agen bekerja. */
export function activityLabel(steps: TrajectoryStep[], hasText: boolean): string {
  const running = [...steps].reverse().find((s) => s.status === 'running');
  if (!running) return hasText ? 'Menyusun jawaban…' : 'Memulai agen…';
  switch (running.type) {
    case 'thought':
      return 'Berpikir…';
    case 'analyzed':
      return `Membaca ${baseName(running.file || running.label)}…`;
    case 'explored':
      return `Mencari ${running.label}…`;
    case 'command':
      return `Menjalankan ${(running.command || running.label).slice(0, 60)}…`;
    case 'edited':
      return `Mengubah ${baseName(running.file || running.label)}…`;
    default:
      return `Memakai ${running.toolName || running.label}…`;
  }
}

/** Ringkasan pendek setelah selesai, mis. "Membaca 4 berkas · 2 perintah · Mengubah 3 berkas". */
export function summaryParts(c: StepCounts): string[] {
  const parts: string[] = [];
  if (c.reads) parts.push(`${c.reads} berkas dibaca`);
  if (c.searches) parts.push(`${c.searches} pencarian`);
  if (c.commands) parts.push(`${c.commands} perintah`);
  if (c.tools) parts.push(`${c.tools} tool`);
  if (c.edits) parts.push(`${c.edits} berkas diubah`);
  return parts;
}

export const EFFORT_LABEL: Record<ChatReasoningEffort, string> = {
  high: 'Tinggi',
  xhigh: 'Sangat tinggi',
  max: 'Maksimum',
};

/** Durasi langkah (bila tercatat). */
export function stepDuration(s: TrajectoryStep, now: number): string | undefined {
  if (!s.startedAt) return s.duration;
  const end = s.endedAt ?? (s.status === 'running' ? now : undefined);
  if (!end) return undefined;
  const ms = end - s.startedAt;
  return ms >= 1000 ? formatDuration(ms) : undefined;
}
