/**
 * chatTurns.ts
 * Menggabungkan giliran lanjutan otomatis ("Izinkan & ulangi" / izin perintah Antigravity) ke jawaban agen
 * sebelumnya: prompt "sudah saya izinkan" tidak tampil sebagai bubble pengguna, dan langkah agen berlanjut
 * dalam satu alur dengan baris "Diizinkan". Hanya tampilan — riwayat tersimpan tetap per pesan.
 * Diuji di `tests/chatTurns.test.mjs`. Spesifikasi: specs/agent-protocols.md §7.
 */
import type { AgentUsage, CodeEditChunk, MessageRecord, TrajectoryStep } from '../../types/database.ts';
import { DENIED_NOTICE_PREFIX } from '../../services/cli/streamParsers.ts';
import { isUserRejection, upsertCodeEdit } from '../../services/cli/trajectoryBuilder.ts';
import { displaySteps } from './work/workSummary.ts';

/** Prompt lanjutan riwayat lama (sebelum `grantContinuation` ada); sinkron dengan `continuePrompt` & `handleRetryWithPermission`. */
const AGY_PROMPT = /^Perintah (.+) sudah saya izinkan\. Jalankan lagi persis seperti sebelumnya/s;
const RETRY_PROMPT = /^Saya mengizinkan aksi yang tadi ditolak \((.+)\)\. Ulangi langkah tersebut/s;
/** Notice "Aksi ditolak di mode aman …" sudah ditindaklanjuti setelah izin diberikan → tidak ditampilkan lagi. */
const DENIED_NOTICE_LINE = new RegExp(`(^|\\n+)> \\S+ ${DENIED_NOTICE_PREFIX}[^\\n]*`, 'g');

export interface ChatTurn {
  /** Pesan yang dirender (gabungan bila giliran ini punya lanjutan otomatis). */
  msg: MessageRecord;
  /** Indeks pesan asli pertama di `messages` (untuk mencari prompt pengguna giliran ini). */
  index: number;
}

/** Aksi/perintah yang diizinkan bila pesan ini lanjutan otomatis; `null` = pesan pengguna biasa. */
export function grantedContinuation(msg: MessageRecord): string[] | null {
  if (msg.sender !== 'user') return null;
  if (msg.grantContinuation?.length) return msg.grantContinuation;
  if (msg.attachments?.length) return null;
  const agy = AGY_PROMPT.exec(msg.content);
  if (agy) return [...agy[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const retry = RETRY_PROMPT.exec(msg.content);
  return retry ? retry[1].split(', ') : null;
}

function stripDeniedNotice(text = ''): string {
  const next = text.replace(DENIED_NOTICE_LINE, '');
  return next === text ? text : next.trim();
}

/** Langkah segmen sebelum izin: notice penolakan dibuang, langkah yang kemudian diizinkan ditandai `resolved`. */
function resolveStep(s: TrajectoryStep, grant: string[], part: MessageRecord): TrajectoryStep[] {
  if (s.type === 'text') {
    const text = stripDeniedNotice(s.text);
    return text.trim() ? [text === s.text ? s : { ...s, text }] : [];
  }
  if (s.status !== 'denied') return [s];
  const granted =
    grant.some((g) => g === s.command || g === s.toolName) ||
    (!!part.deniedActions?.some((a) => grant.includes(a)) && !isUserRejection(s.output));
  return granted ? [{ ...s, resolved: true }] : [s];
}

function grantStep(grant: string[], index: number, at?: number): TrajectoryStep {
  return { type: 'granted', label: 'Diizinkan', command: grant.join(' · '), status: 'done', toolId: `grant-${index}`, startedAt: at, endedAt: at };
}

function sumUsage(parts: MessageRecord[]): AgentUsage | undefined {
  const used = parts.map((p) => p.usage).filter((u): u is AgentUsage => !!u);
  if (used.length === 0) return undefined;
  const total = (pick: (u: AgentUsage) => number | undefined) => used.reduce((n, u) => n + (pick(u) ?? 0), 0);
  const costUsd = total((u) => u.costUsd);
  const credits = total((u) => u.credits);
  const cacheRead = total((u) => u.cacheReadTokens);
  return {
    inputTokens: total((u) => u.inputTokens),
    outputTokens: total((u) => u.outputTokens),
    ...(cacheRead > 0 ? { cacheReadTokens: cacheRead } : {}),
    costUsd: costUsd || undefined,
    credits: credits || undefined,
  };
}

/**
 * Satu jawaban agen dari beberapa segmen. `grants[i]` = izin yang diberikan setelah `parts[i]`.
 * `waiting` = izin sudah dikirim tetapi pesan agen lanjutannya belum dibuat.
 */
function mergeTurn(parts: MessageRecord[], grants: string[][], waiting: boolean): MessageRecord {
  const last = parts[parts.length - 1];
  const steps: TrajectoryStep[] = [];
  parts.forEach((part, i) => {
    const grant = grants[i];
    const segment = displaySteps(part);
    if (!grant) {
      steps.push(...segment);
      return;
    }
    steps.push(...segment.flatMap((s) => resolveStep(s, grant, part)), grantStep(grant, i, parts[i + 1]?.startedAt ?? part.finishedAt));
  });
  const codeEdits = parts.reduce<CodeEditChunk[]>((all, p) => (p.codeEdits ?? []).reduce(upsertCodeEdit, all), []);
  const logs = parts.flatMap((p) => p.logs ?? []);
  // Durasi = waktu kerja agen saja; jeda menunggu keputusan izin tidak ikut dihitung.
  const earlier = parts
    .slice(0, -1)
    .reduce((ms, p) => ms + (p.startedAt && p.finishedAt ? p.finishedAt - p.startedAt : 0), 0);
  return {
    ...last,
    id: parts[0].id,
    content: parts
      .map((p, i) => (grants[i] ? stripDeniedNotice(p.content) : p.content))
      .filter((c) => c.trim())
      .join('\n\n'),
    reasoning: undefined,
    trajectory: steps,
    codeEdits: codeEdits.length ? codeEdits : undefined,
    usage: sumUsage(parts),
    logs: logs.length ? logs : undefined,
    status: waiting ? 'running' : last.status,
    startedAt: waiting ? undefined : last.startedAt ? last.startedAt - earlier : parts[0].startedAt,
    finishedAt: waiting ? undefined : last.finishedAt,
    deniedActions: waiting ? undefined : last.deniedActions,
    deniedCommands: waiting ? undefined : last.deniedCommands,
  };
}

interface Chain {
  turn: number;
  parts: MessageRecord[];
  grants: string[][];
}

/** Pesan → giliran tampilan: jawaban agen + lanjutan otomatisnya (agen yang sama) menjadi satu giliran. */
export function buildChatTurns(messages: MessageRecord[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  const chains: Chain[] = [];
  let open: Chain | null = null;
  for (const [index, m] of messages.entries()) {
    const grant = open && open.grants.length < open.parts.length ? grantedContinuation(m) : null;
    if (open && grant) {
      open.grants.push(grant);
      continue;
    }
    const pending = open && open.grants.length === open.parts.length;
    if (open && pending && m.sender === 'agent' && (!m.agentId || !open.parts[0].agentId || m.agentId === open.parts[0].agentId)) {
      open.parts.push(m);
      continue;
    }
    turns.push({ msg: m, index });
    open = m.sender === 'agent' ? { turn: turns.length - 1, parts: [m], grants: [] } : null;
    if (open) chains.push(open);
  }
  for (const chain of chains) {
    if (chain.grants.length === 0) continue;
    const waiting = chain.grants.length === chain.parts.length && chain === open;
    turns[chain.turn] = { ...turns[chain.turn], msg: mergeTurn(chain.parts, chain.grants, waiting) };
  }
  return turns;
}
