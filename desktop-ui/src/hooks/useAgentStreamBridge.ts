/**
 * useAgentStreamBridge.ts
 * Menghubungkan event CLI headless (UiAgentEvent) ke pesan chat: teks jawaban, jejak penalaran,
 * trajectory tool, pill "Edited" + diff, notice, dan penyimpanan `cliSessionId` untuk resume.
 */
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { MessageRecord } from '../types/database';
import { setupAgentStreamListeners } from '../services/agentStreamParser';
import { buildFileChangeDiff } from '../services/cli/fileChangeDiff';
import type { UiAgentEvent } from '../services/cli/streamParsers';
import {
  addUsage,
  appendLog,
  appendThinking,
  attachDiffToSteps,
  applyToolEvent,
  finalizeMessage,
  isEditTool,
  toolFilePath,
} from '../services/cli/trajectoryBuilder';

export interface ActiveGeneration {
  agentMsgId: string;
  pid?: number;
  timers?: ReturnType<typeof setTimeout>[];
  projectPath?: string;
  conversationId?: string;
  agentId?: string;
}

interface BridgeDeps {
  /** True bila ada transport CLI (Tauri IPC atau jembatan Vite di browser). */
  enabled: boolean;
  activeGenRef: MutableRefObject<ActiveGeneration | null>;
  setMessages: Dispatch<SetStateAction<MessageRecord[]>>;
  setIsGenerating: (v: boolean) => void;
  setIsPaused: (v: boolean) => void;
  showDbToast: (msg: string) => void;
  persistMessage: (msg: MessageRecord) => void;
  onCliSession: (conversationId: string, cliSessionId: string, agentId?: string) => void;
  /** CLI gagal (exit ≠ 0) tanpa satu pun teks jawaban — pemanggil boleh menjalankan fallback cerdas. */
  onCliFailure?: (sessionId: string, summary: string) => void;
}

export function useAgentStreamBridge(deps: BridgeDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const gotText = useRef(new Set<string>());
  /** `<sesi>:<id tool>` → path berkas untuk tool edit; diff dihitung ulang setelah tool selesai. */
  const editTools = useRef(new Map<string, string>());

  useEffect(() => {
    if (!deps.enabled) return;

    const update = (msgId: string, fn: (m: MessageRecord) => MessageRecord) =>
      depsRef.current.setMessages((prev) => prev.map((m) => (m.id === msgId ? fn(m) : m)));

    const attachDiff = async (msgId: string, filePath: string) => {
      const projectPath = depsRef.current.activeGenRef.current?.projectPath;
      if (!projectPath) return;
      const chunk = await buildFileChangeDiff(filePath, projectPath);
      if (!chunk) return;
      update(msgId, (m) => ({
        ...m,
        codeEdits: [...(m.codeEdits || []).filter((c) => c.file !== chunk.file), chunk],
        trajectory: attachDiffToSteps(m.trajectory, chunk),
      }));
    };

    const handle = (sessionId: string, ev: UiAgentEvent) => {
      const gen = depsRef.current.activeGenRef.current;
      const now = Date.now();
      switch (ev.kind) {
        case 'session':
          if (gen?.agentMsgId === sessionId && gen.conversationId) {
            depsRef.current.onCliSession(gen.conversationId, ev.cliSessionId, gen.agentId);
          }
          break;
        case 'text':
          if (ev.delta.trim()) gotText.current.add(sessionId);
          update(sessionId, (m) => ({ ...m, content: m.content + ev.delta }));
          break;
        case 'thinking': {
          // Antigravity mengirim penalaran per potongan token; CLI lain per blok utuh.
          const streaming = (gen?.agentId ?? '') === 'antigravity';
          update(sessionId, (m) => ({
            ...m,
            reasoning: `${m.reasoning || ''}${streaming || !m.reasoning ? '' : '\n\n'}${ev.delta}`,
            trajectory: appendThinking(m.trajectory || [], ev.delta, streaming, now),
          }));
          break;
        }
        case 'log':
          update(sessionId, (m) => ({ ...m, logs: appendLog(m.logs, ev.line) }));
          break;
        case 'tool': {
          const key = `${sessionId}:${ev.id}`;
          const file = toolFilePath(ev.input || {});
          if (isEditTool(ev.name) && file) editTools.current.set(key, file);
          update(sessionId, (m) => ({ ...m, trajectory: applyToolEvent(m.trajectory || [], ev, now) }));
          const editedFile = editTools.current.get(key);
          if (ev.status !== 'running' && editedFile) {
            editTools.current.delete(key);
            void attachDiff(sessionId, editedFile);
          }
          break;
        }
        case 'file_change':
          void attachDiff(sessionId, ev.path);
          break;
        case 'usage':
          update(sessionId, (m) => ({ ...m, usage: addUsage(m.usage, ev) }));
          break;
        case 'notice': {
          const icon = ev.level === 'error' ? '❌' : ev.level === 'warn' ? '⚠️' : 'ℹ️';
          update(sessionId, (m) => ({ ...m, content: `${m.content}\n\n> ${icon} ${ev.message}` }));
          break;
        }
        case 'done':
          update(sessionId, (m) => ({
            ...m,
            status: ev.ok ? m.status : 'error',
            content: !ev.ok && ev.summary ? `${m.content}\n\n> ❌ ${ev.summary}` : m.content,
          }));
          break;
      }
    };

    let unlisten: (() => void) | null = null;
    let cancelled = false;
    setupAgentStreamListeners({
      onSessionStart: (payload) => {
        const gen = depsRef.current.activeGenRef.current;
        if (gen && gen.agentMsgId === payload.sessionId) {
          gen.pid = payload.pid;
          depsRef.current.showDbToast(`Sesi agen ${(payload.agent || '').toUpperCase()} aktif (PID: ${payload.pid})`);
        }
      },
      onEvent: handle,
      onSessionEnd: (payload) => {
        const d = depsRef.current;
        const gen = d.activeGenRef.current;
        const hadText = gotText.current.delete(payload.sessionId);
        if (payload.exitCode !== 0 && !hadText && gen?.agentMsgId === payload.sessionId && d.onCliFailure) {
          // Pemanggil mengambil alih pesan ini (jawaban fallback) dan mengurus status generasi.
          d.onCliFailure(payload.sessionId, payload.summary);
          return;
        }
        if (gen?.agentMsgId === payload.sessionId) {
          d.setIsGenerating(false);
          d.setIsPaused(false);
          d.activeGenRef.current = null;
        }
        d.setMessages((prev) => {
          const msg = prev.find((m) => m.id === payload.sessionId);
          if (!msg) return prev;
          const closed = finalizeMessage(msg, payload.exitCode, Date.now());
          const finalMsg = closed.content.trim()
            ? closed
            : { ...closed, content: `> ⚠️ Agen selesai tanpa jawaban teks (exit code ${payload.exitCode}).` };
          d.persistMessage(finalMsg);
          return prev.map((m) => (m.id === msg.id ? finalMsg : m));
        });
        d.showDbToast(payload.exitCode === 0 ? 'Agen selesai memproses tugas.' : payload.summary);
      },
    }).then((un) => {
      if (cancelled) un();
      else unlisten = un;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [deps.enabled]);
}
