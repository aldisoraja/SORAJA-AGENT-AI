/**
 * useAntigravityApprovals.ts
 * HITL Antigravity di Chat GUI. `agy -p` tidak bisa bertanya izin: perintah shell yang belum diizinkan langsung
 * ditolak dan giliran berakhir. Hook ini menangkap perintah persis yang ditolak (`denied.target`), lalu setelah
 * giliran selesai menanyakannya lewat modal HITL (`hitlBus`). Bila diizinkan: aturan `command(<perintah>)`
 * ditambahkan sementara (IPC `set_antigravity_command_grant`), sesi dilanjutkan otomatis, lalu aturan dicabut
 * saat giliran lanjutan berakhir. Spesifikasi: specs/agent-protocols.md §7.
 */
import { useRef, type MutableRefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { askPermission } from '../services/hitlBus';
import { isTauriRuntime } from '../services/headlessTransport';
import type { UiAgentEvent } from '../services/cli/streamParsers';
import type { ActiveGeneration } from './useAgentStreamBridge';

interface DeniedTurn {
  commands: string[];
  conversationId?: string;
  projectPath?: string;
}

interface AgyApprovalDeps {
  activeGenRef: MutableRefObject<ActiveGeneration | null>;
  /** Percakapan yang sedang dibuka (lanjutan hanya dikirim ke percakapan asalnya). */
  currentConversationId: () => string | undefined;
  /** Mengirim giliran lanjutan dengan izin perintah persis. */
  continueWith: (prompt: string, grantedCommands: string[]) => Promise<void>;
  showDbToast: (msg: string) => void;
}

const DESCRIPTION = 'Antigravity berhenti karena perintah ini butuh izin. Jika diizinkan, percakapan dilanjutkan otomatis.';

function setGrant(command: string, granted: boolean) {
  return invoke<void>('set_antigravity_command_grant', { command, granted });
}

export function continuePrompt(commands: string[]): string {
  const list = commands.map((c) => `\`${c}\``).join(', ');
  return `Perintah ${list} sudah saya izinkan. Jalankan lagi persis seperti sebelumnya, lalu lanjutkan sampai tugasnya selesai.`;
}

export function useAntigravityApprovals(deps: AgyApprovalDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  /** Perintah yang ditolak per sesi yang sedang berjalan. */
  const denied = useRef(new Map<string, DeniedTurn>());
  /** Aturan sementara per sesi lanjutan; dicabut saat sesi itu berakhir. */
  const grants = useRef(new Map<string, string[]>());

  const onAgentEvent = (sessionId: string, ev: UiAgentEvent) => {
    if (!isTauriRuntime || ev.kind !== 'denied' || !ev.target) return;
    const gen = depsRef.current.activeGenRef.current;
    if (gen?.agentMsgId !== sessionId || gen.agentId !== 'antigravity') return;
    const turn = denied.current.get(sessionId) ?? { commands: [], conversationId: gen.conversationId, projectPath: gen.projectPath };
    if (!turn.commands.includes(ev.target)) turn.commands.push(ev.target);
    denied.current.set(sessionId, turn);
  };

  const askAndContinue = async (sessionId: string, turn: DeniedTurn) => {
    const d = depsRef.current;
    const approved: string[] = [];
    for (const [i, command] of turn.commands.entries()) {
      const ok = await askPermission({
        sessionId,
        requestId: `agy-${sessionId}-${i}`,
        toolName: 'run_command',
        input: { command, description: DESCRIPTION },
        context: { conversationId: turn.conversationId, projectPath: turn.projectPath, agentId: 'antigravity' },
      });
      if (ok) approved.push(command);
    }
    if (approved.length === 0) {
      d.showDbToast('Perintah ditolak — Antigravity tidak melanjutkan.');
      return;
    }
    if (d.currentConversationId() !== turn.conversationId) {
      d.showDbToast('Percakapan sudah berganti: buka kembali percakapan Antigravity tadi lalu kirim "lanjutkan".');
      return;
    }
    try {
      for (const command of approved) await setGrant(command, true);
      await d.continueWith(continuePrompt(approved), approved);
    } catch (err) {
      for (const command of approved) await setGrant(command, false).catch(() => {});
      d.showDbToast(`Gagal melanjutkan Antigravity: ${String(err)}`);
    }
  };

  const onSessionClosed = (sessionId: string) => {
    const granted = grants.current.get(sessionId);
    grants.current.delete(sessionId);
    for (const command of granted ?? []) void setGrant(command, false).catch(() => {});
    const turn = denied.current.get(sessionId);
    denied.current.delete(sessionId);
    if (turn?.commands.length) void askAndContinue(sessionId, turn);
  };

  /** Dipanggil setelah giliran lanjutan dispawn: aturan sementaranya dicabut saat sesi itu berakhir. */
  const registerGrants = (sessionId: string, commands: string[]) => {
    if (commands.length) grants.current.set(sessionId, commands);
  };

  return { onAgentEvent, onSessionClosed, registerGrants };
}
