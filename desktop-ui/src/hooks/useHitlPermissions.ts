/**
 * useHitlPermissions.ts
 * HITL Chat GUI: menerima permintaan izin dari `hitlBus` — jembatan MCP Claude (event `agent:permission_request`,
 * dijawab lewat IPC `approve_human_in_the_loop`) dan driver Codex app-server / OpenCode ACP (dijawab lewat stdin).
 * Menjawab otomatis bila ada aturan "selalu izinkan", selain itu mengantrekan modal 5 opsi untuk pengguna.
 * Spesifikasi: specs/agent-protocols.md §7.
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { sorajaDb } from '../services/db';
import { isTauriRuntime } from '../services/headlessTransport';
import { dispatchPermission, setPermissionHandler, type PermissionAsk } from '../services/hitlBus';
import { ruleLabel, summarizePermissionRequest, type PermissionSummary } from '../services/cli/permissionRules';
import type { ActiveGeneration } from './useAgentStreamBridge';

export interface HitlRequest extends PermissionSummary {
  sessionId: string;
  requestId: string;
  toolName: string;
  agentName: string;
  conversationId?: string;
  projectPath?: string;
  /** Kanal jawaban milik sumber permintaan (IPC Claude atau stdin Codex/OpenCode). */
  respond: (approved: boolean) => Promise<void>;
}

/** Opsi modal: 1 sekali, 2 percakapan, 3 proyek, 4 global, 5 tolak. */
export type HitlOption = 1 | 2 | 3 | 4 | 5;

interface HitlDeps {
  activeGenRef: MutableRefObject<ActiveGeneration | null>;
  agentName: (agentId?: string) => string;
  showDbToast: (msg: string) => void;
}

/** Jawaban untuk permintaan dari jembatan MCP Claude (`permission_bridge.rs`). */
function answerClaude(ask: PermissionAsk) {
  return (approved: boolean) =>
    invoke<void>('approve_human_in_the_loop', { sessionId: ask.sessionId, toolCallId: ask.requestId, approved });
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
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const [hitlSelectedOption, setHitlSelectedOption] = useState<HitlOption>(1);
  /** Aturan "selalu izinkan di percakapan ini" (hanya selama aplikasi terbuka). */
  const conversationRules = useRef(new Map<string, Set<string>>());

  useEffect(() => {
    const isPreApproved = async (req: HitlRequest) => {
      const key = req.ruleKey;
      if (!key || req.destructive) return false;
      if (req.conversationId && conversationRules.current.get(req.conversationId)?.has(key)) return true;
      const settings = await sorajaDb.getSettings();
      if (settings.hitlAllowGlobal?.includes(key)) return true;
      return !!req.projectPath && !!settings.hitlAllowProjects?.[req.projectPath]?.includes(key);
    };

    const onRequest = async (p: PermissionAsk, respond: (approved: boolean) => Promise<void>) => {
      const d = depsRef.current;
      const gen = d.activeGenRef.current;
      // Sesi yang sudah dihentikan/diganti tidak boleh menjalankan apa pun.
      if (!gen || gen.agentMsgId !== p.sessionId) {
        respond(false).catch(() => {});
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
        respond,
      };
      if (await isPreApproved(req)) {
        respond(true).catch(() => {});
        d.showDbToast(`Diizinkan otomatis: ${ruleLabel(req.ruleKey!)}.`);
        return;
      }
      setQueue((q) => [...q, req]);
      requestAttention();
    };

    const releaseHandler = setPermissionHandler((ask, respond) => void onRequest(ask, respond));
    if (!isTauriRuntime) return releaseHandler;

    let disposed = false;
    const unlisteners: (() => void)[] = [releaseHandler];
    Promise.all([
      listen<PermissionAsk>('agent:permission_request', (e) => dispatchPermission(e.payload, answerClaude(e.payload))),
      // Sesi selesai/dihentikan: permintaan miliknya tidak berarti lagi (dijawab "tolak"), modalnya ditutup.
      listen<{ sessionId: string }>('agent:session_end', (e) => {
        const sid = e.payload.sessionId;
        for (const r of queueRef.current) if (r.sessionId === sid) r.respond(false).catch(() => {});
        setQueue((q) => q.filter((r) => r.sessionId !== sid));
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
      await req.respond(approved);
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
