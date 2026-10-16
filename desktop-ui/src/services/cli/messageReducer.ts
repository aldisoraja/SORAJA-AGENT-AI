/**
 * messageReducer.ts
 * Reducer murni UiAgentEvent → MessageRecord untuk Chat GUI: teks jawaban, penalaran, timeline tool,
 * aksi ditolak, notice, usage, dan diff berkas. Dipakai `useAgentStreamBridge` dan diuji dengan fixture
 * NDJSON nyata (`tests/chatMessageReducer.test.mjs`). Spesifikasi: specs/agent-protocols.md §3.
 */
import type { CodeEditChunk, MessageRecord } from '../../types/database.ts';
import type { UiAgentEvent } from './streamParsers.ts';
import {
  addUsage,
  appendLog,
  appendThinking,
  applyFileChange,
  applyToolEvent,
  attachDiffToSteps,
  markDenied,
  removeCodeEdit,
  samePath,
  upsertCodeEdit,
} from './trajectoryBuilder.ts';

/** Agen yang mengirim penalaran per potongan token (digabung tanpa pemisah); CLI lain per blok utuh. */
const STREAMING_THINKING_AGENTS = ['antigravity', 'kiro'];

const NOTICE_ICON = { error: '❌', warn: '⚠️', info: 'ℹ️' } as const;

export function applyAgentEvent(m: MessageRecord, ev: UiAgentEvent, now: number): MessageRecord {
  switch (ev.kind) {
    case 'text':
      return { ...m, content: m.content + ev.delta };
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
    case 'tool':
      return { ...m, trajectory: applyToolEvent(m.trajectory || [], ev, now) };
    case 'file_change':
      return { ...m, trajectory: applyFileChange(m.trajectory, ev.path, now) };
    case 'denied':
      return { ...m, trajectory: markDenied(m.trajectory, ev) };
    case 'usage':
      return { ...m, usage: addUsage(m.usage, ev) };
    case 'notice': {
      const line = `> ${NOTICE_ICON[ev.level]} ${ev.message}`;
      // Notice yang sama (mis. dikirim ulang CLI) tidak ditulis dua kali.
      return m.content.includes(line) ? m : { ...m, content: `${m.content}${m.content.trim() ? '\n\n' : ''}${line}` };
    }
    case 'done':
      return {
        ...m,
        status: ev.ok ? m.status : 'error',
        content: !ev.ok && ev.summary ? `${m.content}${m.content.trim() ? '\n\n' : ''}> ❌ ${ev.summary}` : m.content,
      };
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
