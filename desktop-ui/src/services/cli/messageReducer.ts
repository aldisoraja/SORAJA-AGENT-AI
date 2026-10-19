/**
 * messageReducer.ts
 * Reducer murni UiAgentEvent → MessageRecord untuk Chat GUI: teks jawaban, penalaran, timeline tool,
 * aksi ditolak, notice, usage, dan diff berkas. Dipakai `useAgentStreamBridge` dan diuji dengan fixture
 * NDJSON nyata (`tests/chatMessageReducer.test.mjs`). Spesifikasi: specs/agent-protocols.md §3.
 */
import type { CodeEditChunk, MessageRecord } from '../../types/database.ts';
import { DENIED_NOTICE_PREFIX, type UiAgentEvent } from './streamParsers.ts';
import {
  addUsage,
  appendLog,
  appendText,
  appendThinking,
  applyFileChange,
  applyToolEvent,
  attachDiffToSteps,
  isUserRejection,
  markDenied,
  removeCodeEdit,
  samePath,
  upsertCodeEdit,
} from './trajectoryBuilder.ts';

/** Agen yang mengirim penalaran per potongan token (digabung tanpa pemisah); CLI lain per blok utuh. */
const STREAMING_THINKING_AGENTS = ['antigravity', 'kiro'];

const NOTICE_ICON = { error: '❌', warn: '⚠️', info: 'ℹ️' } as const;

function addDenied(m: MessageRecord, action?: string): MessageRecord {
  if (!action || m.deniedActions?.includes(action)) return m;
  return { ...m, deniedActions: [...(m.deniedActions ?? []), action] };
}

/** Baris status (notice, galat, dihentikan) ditambahkan ke jawaban sekaligus ke alur kronologis. */
export function appendAnswerLine(m: MessageRecord, line: string, now: number): MessageRecord {
  const sep = m.content.trim() ? '\n\n' : '';
  return { ...m, content: `${m.content}${sep}${line}`, trajectory: appendText(m.trajectory, `${sep}${line}`, now) };
}

export function applyAgentEvent(m: MessageRecord, ev: UiAgentEvent, now: number): MessageRecord {
  switch (ev.kind) {
    case 'text':
      return { ...m, content: m.content + ev.delta, trajectory: appendText(m.trajectory, ev.delta, now) };
    case 'thinking': {
      const streaming = STREAMING_THINKING_AGENTS.includes(m.agentId ?? '');
      return {
        ...m,
        reasoning: `${m.reasoning || ''}${streaming || !m.reasoning ? '' : '\n\n'}${ev.delta}`,
        trajectory: appendThinking(m.trajectory || [], ev.delta, streaming, now),
      };
    }
    case 'log':
      return { ...m, logs: appendLog(m.logs, ev.line) };
    case 'tool': {
      const trajectory = applyToolEvent(m.trajectory || [], ev, now);
      const step = trajectory.find((s) => s.toolId === ev.id);
      const deniedByPolicy = step?.status === 'denied' && !isUserRejection(step.output);
      return addDenied({ ...m, trajectory }, deniedByPolicy ? ev.name : undefined);
    }
    case 'file_change':
      return { ...m, trajectory: applyFileChange(m.trajectory, ev.path, now) };
    case 'denied': {
      // Aksi yang ditolak pengguna lewat modal HITL tidak perlu tombol "Izinkan & ulangi".
      const step = ev.toolId ? m.trajectory?.find((s) => s.toolId === ev.toolId) : undefined;
      const next = { ...m, trajectory: markDenied(m.trajectory, ev) };
      // Perintah persis (Antigravity) ditangani modal HITL setelah giliran selesai, bukan tombol ulangi.
      if (ev.target) {
        return next.deniedCommands?.includes(ev.target) ? next : { ...next, deniedCommands: [...(next.deniedCommands ?? []), ev.target] };
      }
      return isUserRejection(step?.output) ? next : addDenied(next, ev.action);
    }
    case 'usage':
      return { ...m, usage: addUsage(m.usage, ev) };
    case 'notice': {
      const byUserOnly = ev.message.startsWith(DENIED_NOTICE_PREFIX) && !m.deniedActions?.length;
      const line = byUserOnly ? `> ${NOTICE_ICON.info} Aksi yang Anda tolak tidak dijalankan.` : `> ${NOTICE_ICON[ev.level]} ${ev.message}`;
      // Notice yang sama (mis. dikirim ulang CLI) tidak ditulis dua kali.
      return m.content.includes(line) ? m : appendAnswerLine(m, line, now);
    }
    case 'done': {
      const next = !ev.ok && ev.summary ? appendAnswerLine(m, `> ❌ ${ev.summary}`, now) : m;
      return { ...next, status: ev.ok ? m.status : 'error' };
    }
    default:
      return m;
  }
}

/**
 * Hasil diff git satu berkas: `chunk` = perubahan nyata (ditempel ke timeline + daftar perubahan),
 * `null` = berkas ternyata tidak berubah (statistik lama dibuang agar tidak menampilkan angka palsu).
 */
export function applyFileDiff(m: MessageRecord, file: string, chunk: CodeEditChunk | null): MessageRecord {
  if (chunk) {
    return { ...m, codeEdits: upsertCodeEdit(m.codeEdits, chunk), trajectory: attachDiffToSteps(m.trajectory, chunk) };
  }
  const codeEdits = removeCodeEdit(m.codeEdits, file);
  return {
    ...m,
    codeEdits: codeEdits.length ? codeEdits : undefined,
    trajectory: (m.trajectory || []).map((s) =>
      s.type === 'edited' && samePath(s.file, file) ? { ...s, additions: undefined, deletions: undefined, diff: undefined } : s
    ),
  };
}
