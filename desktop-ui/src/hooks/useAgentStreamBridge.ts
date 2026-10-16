/**
 * useAgentStreamBridge.ts
 * Menghubungkan event CLI headless (UiAgentEvent) ke pesan chat lewat reducer murni
 * (`services/cli/messageReducer.ts`), menghitung diff git berkas yang diubah agen, dan menyimpan
 * `cliSessionId` untuk resume.
 */
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { MessageRecord } from '../types/database';
import { setupAgentStreamListeners } from '../services/agentStreamParser';
import { buildFileChangeDiff } from '../services/cli/fileChangeDiff';
import type { UiAgentEvent } from '../services/cli/streamParsers';
import { applyAgentEvent, applyFileDiff } from '../services/cli/messageReducer';
import { finalizeMessage } from '../services/cli/trajectoryBuilder';

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
  /** Setiap event UI sesi (sebelum diterapkan ke pesan). */
  onAgentEvent?: (sessionId: string, ev: UiAgentEvent) => void;
  /** Proses CLI sesi berakhir (selesai, gagal, atau dihentikan). */
  onSessionClosed?: (sessionId: string, exitCode: number) => void;
}

export function useAgentStreamBridge(deps: BridgeDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const gotText = useRef(new Set<string>());
  /** Folder proyek per sesi: tetap diketahui walau sesi sudah dihentikan/selesai saat diff dihitung. */
  const sessionProjects = useRef(new Map<string, string>());
  /** Nomor urut permintaan diff per `<sesi>|<berkas>`: hanya hasil terbaru yang diterapkan. */
  const diffSeq = useRef(new Map<string, number>());

  useEffect(() => {
    if (!deps.enabled) return;

    const update = (msgId: string, fn: (m: MessageRecord) => MessageRecord) =>
      depsRef.current.setMessages((prev) => prev.map((m) => (m.id === msgId ? fn(m) : m)));

    const attachDiff = async (msgId: string, filePath: string) => {
      const projectPath = sessionProjects.current.get(msgId);
      if (!projectPath) return;
      const key = `${msgId}|${filePath.replace(/\\/g, '/').toLowerCase()}`;
      const seq = (diffSeq.current.get(key) ?? 0) + 1;
      diffSeq.current.set(key, seq);
      const chunk = await buildFileChangeDiff(filePath, projectPath).catch(() => undefined);
      if (chunk === undefined || diffSeq.current.get(key) !== seq) return;
      depsRef.current.setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId) return m;
          const next = applyFileDiff(m, filePath, chunk);
          // Diff yang datang setelah sesi ditutup tetap disimpan agar tidak hilang saat riwayat dibuka ulang.
          if (next.status !== 'running') depsRef.current.persistMessage(next);
          return next;
        })
      );
    };

    const handle = (sessionId: string, ev: UiAgentEvent) => {
      const gen = depsRef.current.activeGenRef.current;
      if (gen?.agentMsgId === sessionId && gen.projectPath) sessionProjects.current.set(sessionId, gen.projectPath);
      if (ev.kind === 'session') {
        if (gen?.agentMsgId === sessionId && gen.conversationId) {
          depsRef.current.onCliSession(gen.conversationId, ev.cliSessionId, gen.agentId);
        }
        return;
      }
      depsRef.current.onAgentEvent?.(sessionId, ev);
      if (ev.kind === 'text' && ev.delta.trim()) gotText.current.add(sessionId);
      const now = Date.now();
      update(sessionId, (m) => applyAgentEvent(m, ev, now));
      if (ev.kind === 'file_change') void attachDiff(sessionId, ev.path);
    };

    let unlisten: (() => void) | null = null;
    let cancelled = false;
    setupAgentStreamListeners({
      onSessionStart: (payload) => {
        const gen = depsRef.current.activeGenRef.current;
        if (gen && gen.agentMsgId === payload.sessionId) {
          gen.pid = payload.pid;
          if (gen.projectPath) sessionProjects.current.set(payload.sessionId, gen.projectPath);
          depsRef.current.showDbToast(`Sesi agen ${(payload.agent || '').toUpperCase()} aktif (PID: ${payload.pid})`);
        }
      },
      onEvent: handle,
      onSessionEnd: (payload) => {
        const d = depsRef.current;
        d.onSessionClosed?.(payload.sessionId, payload.exitCode);
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
