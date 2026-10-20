/**
 * workSummary.ts
 * Helper murni untuk panel "Proses kerja" agen: ringkasan langkah, pengelompokan, label aktivitas live,
 * statistik diff, serta format durasi & token. Diuji di `tests/chatWorkSummary.test.mjs`.
 */
import type { ChatReasoningEffort, CodeEditChunk, MessageRecord, TrajectoryStep } from '../../../types/database.ts';
import { samePath } from '../../../services/cli/trajectoryBuilder.ts';

export interface StepCounts {
  thoughts: number;
  reads: number;
  searches: number;
  web: number;
  commands: number;
  /** Jumlah berkas unik yang diubah (bukan jumlah panggilan tool edit). */
  edits: number;
  tools: number;
  errors: number;
  denied: number;
  additions: number;
  deletions: number;
}

const norm = (p = '') => p.replace(/\\/g, '/').toLowerCase();

/**
 * Hitungan langkah untuk ringkasan. Total +/− diambil dari `codeEdits` (diff kumulatif per berkas)
 * agar berkas yang diedit berkali-kali tidak terhitung ganda.
 */
export function countSteps(steps: TrajectoryStep[], codeEdits?: CodeEditChunk[]): StepCounts {
  const c: StepCounts = { thoughts: 0, reads: 0, searches: 0, web: 0, commands: 0, edits: 0, tools: 0, errors: 0, denied: 0, additions: 0, deletions: 0 };
  const editedFiles = new Map<string, { additions: number; deletions: number }>();
  for (const s of steps) {
    if (s.status === 'error') c.errors++;
    if (s.status === 'denied' && !s.resolved) c.denied++;
    if (s.type === 'thought') c.thoughts++;
    else if (s.type === 'analyzed') c.reads++;
    else if (s.type === 'explored') c.searches++;
    else if (s.type === 'web') c.web++;
    else if (s.type === 'command') c.commands++;
    else if (s.type === 'tool') c.tools++;
    else if (s.type === 'edited' && s.status !== 'denied' && s.status !== 'error') {
      const key = norm(s.diff?.file || s.file || s.label);
      // Diff kumulatif ditempel ke setiap langkah berkas yang sama → cukup diambil sekali.
      editedFiles.set(key, { additions: s.additions ?? 0, deletions: s.deletions ?? 0 });
    }
  }
  if (codeEdits && codeEdits.length > 0) {
    c.edits = codeEdits.length;
    for (const e of codeEdits) {
      c.additions += e.additions;
      c.deletions += e.deletions;
    }
  } else {
    c.edits = editedFiles.size;
    for (const v of editedFiles.values()) {
      c.additions += v.additions;
      c.deletions += v.deletions;
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

export interface MessageFlow {
  /** Langkah proses kronologis (termasuk segmen penjelasan perantara). */
  process: TrajectoryStep[];
  /** Jawaban akhir yang tetap tampil saat proses dilipat. */
  answer: string;
}

/**
 * Membagi pesan agen menjadi alur proses + jawaban akhir. Saat berjalan semua teks tampil di dalam alur;
 * setelah selesai segmen teks terakhir menjadi jawaban di bawah proses yang dilipat.
 * Pesan lama tanpa langkah `text`: jawaban = `content`.
 */
export function messageFlow(msg: MessageRecord): MessageFlow {
  const steps = displaySteps(msg);
  const last = steps.findLastIndex((s) => s.type === 'text');
  if (last < 0) return { process: steps, answer: msg.content };
  if (msg.status === 'running') return { process: steps, answer: '' };
  return { process: steps.filter((_, i) => i !== last), answer: steps[last].text || '' };
}

const isMergeableEdit =(s: TrajectoryStep) => s.type === 'edited' && s.status !== 'denied' && s.status !== 'error' && !!(s.file || s.diff?.file);
const editKey = (s: TrajectoryStep) => norm(s.file || s.diff?.file);

/**
 * Edit berulang pada berkas yang sama digabung ke posisi edit terakhirnya: diff git bersifat kumulatif,
 * jadi tiap baris akan menampilkan kode yang sama persis. `count` = jumlah panggilan edit berkas itu.
 * Edit yang gagal/ditolak tetap tampil terpisah.
 */
export function mergeFileEdits(steps: TrajectoryStep[]): TrajectoryStep[] {
  const total = new Map<string, number>();
  for (const s of steps) if (isMergeableEdit(s)) total.set(editKey(s), (total.get(editKey(s)) ?? 0) + 1);
  const seen = new Map<string, number>();
  return steps.flatMap((s) => {
    if (!isMergeableEdit(s)) return [s];
    const key = editKey(s);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const all = total.get(key) ?? 1;
    return n < all ? [] : [all > 1 ? { ...s, count: all } : s];
  });
}

export type StepItem =
  | { kind: 'step'; step: TrajectoryStep; key: string }
  | { kind: 'group'; steps: TrajectoryStep[]; key: string };

const EXPLORE_TYPES: TrajectoryStep['type'][] = ['analyzed', 'explored'];

/**
 * Menggabungkan rangkaian baca/cari berurutan (≥ `min` langkah) menjadi satu baris "Menelusuri kode"
 * agar timeline tidak penuh oleh puluhan baris baca berkas. Langkah yang masih berjalan ikut masuk grup
 * (grup menampilkan status live) supaya baris tidak muncul lalu terserap lagi — timeline tidak naik-turun.
 * Batas 2: satu baris baca berganti jadi satu baris grup (tinggi sama), jadi tidak ada lompatan tinggi.
 */
export function groupSteps(steps: TrajectoryStep[], min = 2): StepItem[] {
  const items: StepItem[] = [];
  let run: { step: TrajectoryStep; index: number }[] = [];
  let texts = 0;
  // Baris edit gabungan berpindah toolId tiap ada edit baru → kunci per berkas agar state buka/tutup tidak hilang.
  // Segmen teks tidak pernah dihapus → nomor urutnya stabil walau indeks bergeser karena penggabungan edit.
  const keyOf = (s: TrajectoryStep, i: number) =>
    s.type === 'text' ? `text-${texts++}` : isMergeableEdit(s) ? `edit-${editKey(s)}` : s.toolId ?? `${s.type}-${i}`;
  const flush = () => {
    if (run.length >= min) items.push({ kind: 'group', steps: run.map((r) => r.step), key: `grp-${keyOf(run[0].step, run[0].index)}` });
    else run.forEach((r) => items.push({ kind: 'step', step: r.step, key: keyOf(r.step, r.index) }));
    run = [];
  };
  steps.forEach((step, index) => {
    if (EXPLORE_TYPES.includes(step.type)) {
      run.push({ step, index });
      return;
    }
    flush();
    items.push({ kind: 'step', step, key: keyOf(step, index) });
  });
  flush();
  return items;
}

/** Kalimat ringkas untuk grup baca/cari, mis. "5 berkas dibaca · 2 pencarian". */
export function groupSummary(steps: TrajectoryStep[]): string {
  const reads = new Set(steps.filter((s) => s.type === 'analyzed').map((s) => norm(s.label || s.file))).size;
  const searches = steps.filter((s) => s.type === 'explored').length;
  return [reads ? `${reads} berkas dibaca` : '', searches ? `${searches} pencarian` : ''].filter(Boolean).join(' · ');
}

/**
 * Bar statistik diff ala GitHub: `total` kotak dibagi proporsional tambah/hapus (minimal 1 kotak
 * untuk sisi yang tidak nol), sisanya netral.
 */
export function diffBlocks(additions: number, deletions: number, total = 5): Array<'add' | 'del' | 'none'> {
  const sum = additions + deletions;
  if (sum <= 0) return Array(total).fill('none');
  const filled = Math.min(total, Math.max(1, Math.ceil(Math.log10(sum + 1) * 2)));
  let add = Math.round((additions / sum) * filled);
  if (additions > 0 && add === 0) add = 1;
  if (deletions > 0 && add === filled) add = filled - 1;
  const del = filled - add;
  return [...Array(add).fill('add'), ...Array(del).fill('del'), ...Array(total - filled).fill('none')];
}

/** Memecah path menjadi folder & nama berkas (untuk tampilan "src/components/ App.tsx"). */
export function splitPath(p = ''): { dir: string; name: string } {
  const clean = p.replace(/\\/g, '/');
  const i = clean.lastIndexOf('/');
  return i < 0 ? { dir: '', name: clean } : { dir: clean.slice(0, i + 1), name: clean.slice(i + 1) };
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
  if (!running) return hasText ? 'Menyusun jawaban…' : steps.length ? 'Melanjutkan…' : 'Memulai agen…';
  switch (running.type) {
    case 'thought':
      return 'Berpikir…';
    case 'analyzed':
      return `Membaca ${baseName(running.file || running.label)}…`;
    case 'explored':
      return `Mencari ${running.label}…`;
    case 'web':
      return `Menjelajah web: ${running.label.slice(0, 60)}…`;
    case 'plan':
      return 'Menyusun rencana kerja…';
    case 'command':
      return `Menjalankan ${(running.command || running.label).slice(0, 60)}…`;
    case 'edited':
      return `Mengubah ${baseName(running.file || running.label)}…`;
    default:
      return `Memakai ${running.toolName || running.label}…`;
  }
}

/** Ringkasan pendek setelah selesai, mis. "4 berkas dibaca · 2 perintah · 3 berkas diubah". */
export function summaryParts(c: StepCounts): string[] {
  const parts: string[] = [];
  if (c.reads) parts.push(`${c.reads} berkas dibaca`);
  if (c.searches) parts.push(`${c.searches} pencarian`);
  if (c.web) parts.push(`${c.web} akses web`);
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

/** Diff berkas sebuah langkah "edited": dari daftar perubahan pesan, atau diff lama yang tersimpan di langkah. */
export function diffForStep(step: TrajectoryStep, codeEdits?: CodeEditChunk[]): CodeEditChunk | undefined {
  const file = step.file || step.diff?.file;
  const found = file ? codeEdits?.find((e) => samePath(e.file, file) || samePath(e.relativePath, file)) : undefined;
  return found ?? step.diff;
}

/** Cuplikan diff ringkas: baris berubah + 1 baris konteks di sekitarnya, maksimal `limit` baris. */
export function diffPreview(chunk: CodeEditChunk, limit = 14): { lines: CodeEditChunk['diffLines']; hidden: number } {
  const lines = chunk.diffLines;
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (l.type === 'added' || l.type === 'deleted') [i - 1, i, i + 1].forEach((j) => j >= 0 && j < lines.length && keep.add(j));
  });
  const picked = [...keep].sort((a, b) => a - b).map((i) => lines[i]).filter((l) => l.type !== 'collapsed');
  const changed = lines.filter((l) => l.type === 'added' || l.type === 'deleted').length;
  const shownChanged = picked.slice(0, limit).filter((l) => l.type === 'added' || l.type === 'deleted').length;
  return { lines: picked.slice(0, limit), hidden: changed - shownChanged };
}
