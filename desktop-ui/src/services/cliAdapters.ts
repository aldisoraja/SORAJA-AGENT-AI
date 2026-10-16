import type { AgentProvider, ModelItem } from '../types/agent';
import { invoke } from '@tauri-apps/api/core';
import { getAgentIcon } from '../components/AgentIcons';
import { getFallbackAgentProviders } from '../constants/agentProviders';
import { registerSessionAgent } from './agentStreamParser';
import { bridgeSpawn, bridgeStop, hasHeadlessBridge, isTauriRuntime } from './headlessTransport';
import {
  buildHeadlessCommand,
  RPC_HITL_AGENTS,
  type CliAgentId,
  type PermissionMode,
} from './cli/agentCommands';
import { spawnRpcAgentSession } from './rpcHeadless';
import type { ChatEffort } from './cli/chatPrompt';

export interface HeadlessSpawnOptions {
  sessionId: string;
  agent: AgentProvider;
  prompt: string;
  projectPath: string;
  modelId?: string;
  cliSessionId?: string;
  permissionMode?: PermissionMode;
  apiKey?: string;
  /** Kedalaman penalaran Chat GUI (flag effort CLI). */
  effort?: ChatEffort;
  /** Aturan penalaran mendalam & format jawaban khusus Chat GUI. */
  chatRules?: boolean;
  /** Path absolut lampiran yang sudah disimpan (chatAttachmentStore). */
  imagePaths?: string[];
  filePaths?: string[];
  /** Aksi yang diizinkan ulang pengguna untuk satu giliran ("Izinkan & ulangi"). */
  grantedActions?: string[];
}

/**
 * URL MCP jembatan izin HITL untuk sesi Claude di mode aman (specs/agent-protocols.md §7).
 * Gagal → `undefined`: Claude kembali ke perilaku lama (aksi berisiko ditolak otomatis).
 */
async function preparePermissionBridge(sessionId: string): Promise<string | undefined> {
  try {
    return await invoke<string>('prepare_permission_bridge', { sessionId });
  } catch (err) {
    console.warn('Jembatan izin HITL tidak tersedia:', err);
    return undefined;
  }
}

const languageRulesCache = new Map<string, Promise<string | undefined>>();

/**
 * Menyiapkan aturan "jawab dalam Bahasa Indonesia" untuk agen (IPC `prepare_agent_language_rules`).
 * Mengembalikan path berkas aturan bersama di %APPDATA%/soraja-ai/rules (dipakai OpenCode).
 */
export function prepareLanguageRules(agentId: string): Promise<string | undefined> {
  let cached = languageRulesCache.get(agentId);
  if (!cached) {
    cached = invoke<string>('prepare_agent_language_rules', { agentId }).catch((err) => {
      console.warn('Gagal menyiapkan aturan bahasa:', err);
      languageRulesCache.delete(agentId);
      return undefined;
    });
    languageRulesCache.set(agentId, cached);
  }
  return cached;
}

/** Mode Chat GUI: menjalankan CLI agen headless (specs/agent-protocols.md §2). */
export async function spawnHeadlessAgentSession(o: HeadlessSpawnOptions): Promise<void> {
  const agentId = o.agent.id;
  // Browser dev tidak punya IPC Tauri: trust workspace & aturan bahasa via berkas dilewati
  // (aturan bahasa tetap diterapkan lewat prefix prompt / flag di buildHeadlessCommand).
  if (isTauriRuntime && (agentId === 'antigravity' || agentId === 'agy')) {
    await ensureWorkspaceTrustedForCli(o.projectPath, 'antigravity');
  }
  const languageRulesPath = isTauriRuntime ? await prepareLanguageRules(agentId) : undefined;
  const permissionPromptUrl =
    isTauriRuntime && agentId === 'claude' && o.permissionMode !== 'autonomous'
      ? await preparePermissionBridge(o.sessionId)
      : undefined;
  const launch = {
    agentId,
    executable: o.agent.binaryPath || o.agent.executable || (agentId === 'antigravity' ? 'agy' : agentId),
    cwd: o.projectPath,
    prompt: o.prompt,
    modelId: o.modelId,
    cliSessionId: o.cliSessionId,
    permissionMode: o.permissionMode,
    languageRulesPath,
    apiKey: o.apiKey,
    effort: o.effort,
    chatRules: o.chatRules,
    imagePaths: o.imagePaths,
    filePaths: o.filePaths,
    permissionPromptUrl,
    grantedActions: o.grantedActions,
  };
  // Codex & OpenCode mode aman: protokol JSON-RPC agar perintah shell bisa ditanyakan ke pengguna (HITL).
  // "Izinkan & ulangi" dan mode otonom tetap memakai mode exec/run biasa.
  const rpcHitl =
    isTauriRuntime &&
    o.permissionMode !== 'autonomous' &&
    !o.grantedActions?.length &&
    RPC_HITL_AGENTS.includes(agentId as CliAgentId);
  if (rpcHitl) {
    await spawnRpcAgentSession({ ...launch, sessionId: o.sessionId });
    return;
  }
  const command = buildHeadlessCommand(launch);

  registerSessionAgent(o.sessionId, agentId);
  if (!isTauriRuntime) {
    if (!hasHeadlessBridge) throw new Error('Jembatan CLI tidak tersedia di browser ini.');
    bridgeSpawn({ sessionId: o.sessionId, agentId, agentArgs: command.args, cwd: o.projectPath, envs: command.envs });
    return;
  }
  await invoke('spawn_headless_agent', {
    sessionId: o.sessionId,
    agent: agentId,
    agentExecutable: command.executable,
    agentArgs: command.args,
    cwd: o.projectPath,
    envs: command.envs,
  });
}

export async function stopHeadlessAgentSession(pid: number, sessionId?: string): Promise<void> {
  if (!isTauriRuntime) {
    if (sessionId) bridgeStop(sessionId);
    return;
  }
  await invoke('stop_agent_session', { pid });
}

export async function pauseHeadlessAgentSession(pid: number): Promise<void> {
  await invoke('pause_agent_session', { pid });
}

export async function resumeHeadlessAgentSession(pid: number): Promise<void> {
  await invoke('resume_agent_session', { pid });
}

export interface CliAgentStatus {
  id: string;
  name: string;
  executable: string;
  is_installed: boolean;
  path?: string | null;
  vendor?: string;
  description?: string;
}

export async function fetchInstalledCliAgents(): Promise<Record<string, CliAgentStatus>> {
  try {
    const result = await invoke<CliAgentStatus[]>('get_available_cli_agents');
    const map: Record<string, CliAgentStatus> = {};
    for (const a of result) {
      map[a.id] = a;
    }
    return map;
  } catch {
    // Tanpa Tauri (browser dev): deteksi lewat jembatan Vite; bila tak tersedia → anggap belum terpasang.
    try {
      const res = await fetch('/api/cli-installed');
      if (!res.ok) return {};
      const map: Record<string, CliAgentStatus> = {};
      for (const a of (await res.json()) as CliAgentStatus[]) map[a.id] = a;
      return map;
    } catch {
      return {};
    }
  }
}

/**
 * Sumber Kebenaran Tunggal (SSOT):
 * Mengambil daftar Agen AI dan seluruh model masing-masing secara 100% dinamis dari Backend Rust (Tauri IPC).
 * Tanpa hardcode di frontend: nama model, token context, dan status binary CLI datang dari backend.
 */
/** Status terpasang/tidaknya keempat CLI (cepat, tanpa menjalankan CLI). Kosong bila tanpa Tauri. */
export async function fetchInstalledCliStatuses(): Promise<CliAgentStatus[]> {
  try {
    return await invoke<CliAgentStatus[]>('get_available_cli_agents');
  } catch {
    return [];
  }
}

export async function fetchAuthoritativeAgentProviders(): Promise<AgentProvider[]> {
  try {
    const raw = await invoke<AgentProvider[]>('get_agent_providers');
    return raw.map((p) => ({
      ...p,
      icon: getAgentIcon(p.iconName || p.id),
    }));
  } catch (err) {
    console.warn('Backend get_agent_providers failed or not in Tauri environment, using fallback:', err);
    // Browser dev: ganti model katalog cadangan dengan daftar `/model` CLI asli lewat jembatan Vite.
    return Promise.all(
      getFallbackAgentProviders().map(async (p) => {
        const live = await fetchBridgeModels(p.id);
        return live.length > 0 ? { ...p, models: live, defaultModelId: live[0].id } : p;
      })
    );
  }
}

/** Daftar model dari jembatan dev Vite (`/api/cli-models`); kosong bila jembatan/CLI tidak tersedia. */
async function fetchBridgeModels(agentId: string): Promise<ModelItem[]> {
  try {
    const res = await fetch(`/api/cli-models?agentId=${encodeURIComponent(agentId)}`);
    return res.ok ? ((await res.json()) as ModelItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * Mengambil katalog model spesifik untuk agen tertentu secara dinamis dari Backend.
 */
export async function fetchAuthoritativeAgentModels(agentId: string): Promise<ModelItem[]> {
  try {
    return await invoke<ModelItem[]>('get_agent_models', { agentId });
  } catch (err) {
    console.warn(`Backend get_agent_models failed for ${agentId}:`, err);
    return fetchBridgeModels(agentId);
  }
}

/** Pemakaian & kuota dari CLI (specs/ipc-contracts.md §3). Field `undefined/null` = tidak dilaporkan CLI. */
export interface AgentTokenStats {
  agentId: string;
  quotaKnown: boolean;
  /** Sisa kuota jendela panjang (mingguan / 30 hari), persen. */
  weeklyLimitPercent?: number | null;
  /** Sisa kuota 5 jam, persen. */
  fiveHourLimitPercent?: number | null;
  /** Unix detik saat kuota direset. */
  weeklyResetAt?: number | null;
  fiveHourResetAt?: number | null;
  weeklyWindowMinutes?: number | null;
  inputTokens: number;
  outputTokens: number;
  usedWeeklyTokens: number;
  totalCostUsd?: number | null;
  sessionsCount: number;
  messagesCount: number;
  source: string;
  statusMessage: string;
}

/** Tanpa Tauri (Vite dev di browser): baca data riil lewat jembatan dev `/api/cli-*`. */
async function devBridge<T>(endpoint: string, agentId: string, cause: unknown): Promise<T | null> {
  try {
    const res = await fetch(`/api/${endpoint}?agentId=${encodeURIComponent(agentId)}`);
    if (res.ok) return (await res.json()) as T;
  } catch {
    // jembatan tidak tersedia
  }
  console.warn(`Data CLI ${agentId} tidak tersedia (${endpoint}):`, cause);
  return null;
}

/** Membaca pemakaian token & kuota langsung dari berkas/perintah CLI agen (null bila tanpa Tauri). */
export async function fetchLiveAgentTokenStats(agentId: string): Promise<AgentTokenStats | null> {
  try {
    return await invoke<AgentTokenStats>('get_agent_token_stats', { agentId });
  } catch (err) {
    return devBridge<AgentTokenStats>('cli-stats', agentId, err);
  }
}

/** Profil akun yang dibaca dari CLI (specs/ipc-contracts.md §3). String kosong = tidak diketahui. */
export interface UserCliProfile {
  agentId: string;
  isLoggedIn: boolean;
  /** 'subscription' | 'api_key' | 'multi_provider' | 'none' */
  authMethod: string;
  name: string;
  email: string;
  planTier: string;
  accountType: string;
  statusDetails: string;
  source: string;
  detectedAt: string;
}

/** Mengambil profil akun & paket langganan langsung dari CLI (null bila tanpa Tauri). */
export async function fetchUserCliProfile(agentId: string): Promise<UserCliProfile | null> {
  try {
    return await invoke<UserCliProfile>('get_user_cli_profile', { agentId });
  } catch (err) {
    return devBridge<UserCliProfile>('cli-profile', agentId, err);
  }
}

/**
 * Memastikan direktori proyek terdaftar dalam workspace terpercaya CLI agar mesin langsung berjalan tanpa prompt.
 */
export async function ensureWorkspaceTrustedForCli(workspacePath: string, agentId: string): Promise<void> {
  try {
    await invoke('trust_and_prepare_workspace_for_cli', { workspacePath, agentId });
  } catch (err) {
    console.warn('Failed to trust workspace for CLI:', err);
  }
}


