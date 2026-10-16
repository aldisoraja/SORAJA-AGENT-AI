/**
 * useHitlPermissions.ts
 * HITL Chat GUI: menerima event `agent:permission_request` dari jembatan izin (permission_bridge.rs),
 * menjawab otomatis bila ada aturan "selalu izinkan", selain itu mengantrekan modal 5 opsi untuk pengguna.
 * Jawaban dikirim lewat IPC `approve_human_in_the_loop`. Spesifikasi: specs/agent-protocols.md §7.
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { sorajaDb } from '../services/db';
import { isTauriRuntime } from '../services/headlessTransport';
import { ruleLabel, summarizePermissionRequest, type PermissionSummary } from '../services/cli/permissionRules';
import type { ActiveGeneration } from './useAgentStreamBridge';

export interface HitlRequest extends PermissionSummary {
  sessionId: string;
  requestId: string;
  toolName: string;
  agentName: string;
  conversationId?: string;
  projectPath?: string;
}

/** Opsi modal: 1 sekali, 2 percakapan, 3 proyek, 4 global, 5 tolak. */
export type HitlOption = 1 | 2 | 3 | 4 | 5;

interface PermissionRequestPayload {
  sessionId: string;
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
}

interface HitlDeps {
  activeGenRef: MutableRefObject<ActiveGeneration | null>;
  agentName: (agentId?: string) => string;
  showDbToast: (msg: string) => void;
}

function answer(req: Pick<HitlRequest, 'sessionId' | 'requestId'>, approved: boolean) {
  return invoke('approve_human_in_the_loop', { sessionId: req.sessionId, toolCallId: req.requestId, approved });
}

/** Kedipkan ikon taskbar bila jendela sedang tidak aktif: agen menunggu jawaban pengguna. */
function requestAttention() {
  if (document.hasFocus()) return;
  import('@tauri-apps/api/window')
    .then(({ getCurrentWindow, UserAttentionType }) => getCurrentWindow().requestUserAttention(UserAttentionType.Critical))
    .catch(() => {});
}

export function useHitlPermissions(deps: HitlDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [queue, setQueue] = useState<HitlRequest[]>([]);
  const [hitlSelectedOption, setHitlSelectedOption] = useState<HitlOption>(1);
  /** Aturan "selalu izinkan di percakapan ini" (hanya selama aplikasi terbuka). */
  const conversationRules = useRef(new Map<string, Set<string>>());

  useEffect(() => {
    if (!isTauriRuntime) return;
    const isPreApproved = async (req: HitlRequest) => {
      const key = req.ruleKey;
      if (!key || req.destructive) return false;
      if (req.conversationId && conversationRules.current.get(req.conversationId)?.has(key)) return true;
      const settings = await sorajaDb.getSettings();
      if (settings.hitlAllowGlobal?.includes(key)) return true;
      return !!req.projectPath && !!settings.hitlAllowProjects?.[req.projectPath]?.includes(key);
    };

    const onRequest = async (p: PermissionRequestPayload) => {
      const d = depsRef.current;
      const gen = d.activeGenRef.current;
      // Sesi yang sudah dihentikan/diganti tidak boleh menjalankan apa pun.
      if (!gen || gen.agentMsgId !== p.sessionId) {
        answer(p, false).catch(() => {});
        return;
      }
      const req: HitlRequest = {
        ...summarizePermissionRequest(p.toolName, p.input ?? {}),
        sessionId: p.sessionId,
        requestId: p.requestId,
        toolName: p.toolName,
        agentName: d.agentName(gen.agentId),
        conversationId: gen.conversationId,
        projectPath: gen.projectPath,
      };
      if (await isPreApproved(req)) {
        answer(req, true).catch(() => {});
        d.showDbToast(`Diizinkan otomatis: ${ruleLabel(req.ruleKey!)}.`);
        return;
      }
      setQueue((q) => [...q, req]);
      requestAttention();
    };

    let disposed = false;
    const unlisteners: (() => void)[] = [];
    Promise.all([
      listen<PermissionRequestPayload>('agent:permission_request', (e) => void onRequest(e.payload)),
      // Sesi selesai/dihentikan: permintaan miliknya sudah dibatalkan backend, modalnya ditutup.
      listen<{ sessionId: string }>('agent:session_end', (e) => {
        setQueue((q) => q.filter((r) => r.sessionId !== e.payload.sessionId));
        setHitlSelectedOption(1);
      }),
    ]).then((fns) => {
      if (disposed) fns.forEach((fn) => fn());
      else unlisteners.push(...fns);
    });
    return () => {
      disposed = true;
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  const saveRule = async (req: HitlRequest, option: HitlOption) => {
    const key = req.ruleKey;
    if (!key || req.destructive) return;
    if (option === 2 && req.conversationId) {
      const set = conversationRules.current.get(req.conversationId) ?? new Set<string>();
      conversationRules.current.set(req.conversationId, set.add(key));
    } else if (option === 3 && req.projectPath) {
      const settings = await sorajaDb.getSettings();
      const projects = { ...(settings.hitlAllowProjects ?? {}) };
      projects[req.projectPath] = [...new Set([...(projects[req.projectPath] ?? []), key])];
      await sorajaDb.saveSettings({ hitlAllowProjects: projects });
    } else if (option === 4) {
      const settings = await sorajaDb.getSettings();
      await sorajaDb.saveSettings({ hitlAllowGlobal: [...new Set([...(settings.hitlAllowGlobal ?? []), key])] });
    }
  };

  const answerHitl = async (option: number) => {
    const req = queue[0];
    if (!req) return;
    setQueue((q) => q.slice(1));
    setHitlSelectedOption(1);
    const approved = option !== 5;
    if (approved && option > 1) await saveRule(req, option as HitlOption).catch(() => {});
    try {
      await answer(req, approved);
      if (!approved) depsRef.current.showDbToast(`Aksi ${req.toolName} ditolak.`);
      else if (option > 1 && req.ruleKey && !req.destructive) {
        const scope = option === 2 ? 'percakapan ini' : option === 3 ? 'proyek ini' : 'semua proyek';
        depsRef.current.showDbToast(`${ruleLabel(req.ruleKey)} selalu diizinkan di ${scope}.`);
      }
    } catch (err) {
      depsRef.current.showDbToast(String(err));
    }
  };

  return {
    hitlRequest: queue[0] ?? null,
    hitlQueueLength: queue.length,
    hitlSelectedOption,
    setHitlSelectedOption: (opt: number) => setHitlSelectedOption(opt as HitlOption),
    answerHitl,
  };
}
