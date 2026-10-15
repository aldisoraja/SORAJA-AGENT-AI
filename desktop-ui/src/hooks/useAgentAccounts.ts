/**
 * useAgentAccounts.ts
 * Katalog agen CLI, agen/model terpilih, serta akun & kuota yang dibaca LANGSUNG dari CLI
 * (get_user_cli_profile + get_agent_token_stats). Status "Terhubung" = login CLI terdeteksi
 * atau API key tersimpan — tidak ada nilai paket/kuota karangan.
 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { sorajaDb, type CredentialRecord, type ProjectRecord } from '../services/db';
import {
  ensureWorkspaceTrustedForCli,
  fetchAuthoritativeAgentModels,
  fetchAuthoritativeAgentProviders,
  fetchInstalledCliStatuses,
  fetchLiveAgentTokenStats,
  fetchUserCliProfile,
  type CliAgentStatus,
} from '../services/cliAdapters';
import type { AgentProvider, ModelItem } from '../types/agent';
import { AGENT_PROVIDERS } from '../constants/agentProviders';
import { loadSessionState, saveSessionState } from '../utils/sessionState';

export const DEFAULT_FALLBACK_MODEL: ModelItem = {
  id: 'cli-default',
  name: 'Pilih Model CLI',
  speed: 'Live',
  desc: 'Model dimuat langsung dari CLI agen',
};

const AGENT_IDS = ['antigravity', 'claude', 'codex', 'opencode', 'kiro'];
/** Pembacaan profil/kuota agen ini memakai PTY + jeda tunggu, jadi dijalankan terakhir. */
const HEAVY_AGENT_ID = 'antigravity';
/** Jeda sebelum pembacaan CLI yang berat dimulai, agar UI sempat tampil & responsif lebih dulu. */
const STARTUP_PROBE_DELAY_MS = 2500;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface AgentAccountsDeps {
  activeProject: ProjectRecord | null;
  setCredentials: Dispatch<SetStateAction<Record<string, CredentialRecord>>>;
  showDbToast: (msg: string) => void;
}

export function useAgentAccounts({ activeProject, setCredentials, showDbToast }: AgentAccountsDeps) {
  const [agentProviders, setAgentProviders] = useState<AgentProvider[]>(AGENT_PROVIDERS);
  const [selectedAgent, setSelectedAgent] = useState<AgentProvider>(() => {
    const savedId = loadSessionState<string>('selectedAgentId', '');
    return AGENT_PROVIDERS.find((p) => p.id === savedId) || AGENT_PROVIDERS[0];
  });
  const [selectedModel, setSelectedModel] = useState<ModelItem>(() => {
    const savedModelId = loadSessionState<string>('selectedModelId', '');
    const models = selectedAgent.models || [];
    return models.find((m) => m.id === savedModelId) || models[0] || DEFAULT_FALLBACK_MODEL;
  });
  useEffect(() => saveSessionState('selectedAgentId', selectedAgent.id), [selectedAgent.id]);
  useEffect(() => saveSessionState('selectedModelId', selectedModel.id), [selectedModel.id]);
  const [installedCliAgents, setInstalledCliAgents] = useState<Record<string, CliAgentStatus>>({});

  /** Profil (login, email, paket) + kuota untuk satu agen, langsung dari CLI. */
  const syncAgentAccount = async (agentId: string) => {
    const [profile, stats] = await Promise.all([fetchUserCliProfile(agentId), fetchLiveAgentTokenStats(agentId)]);
    await sorajaDb.applyCliProfile(agentId, profile);
    return sorajaDb.syncLiveQuota(agentId, stats);
  };

  /** Dipanggil juga dari tombol UI (argumen bisa berupa event) → hanya `{ silent: true }` yang membisukan toast. */
  const handleSyncLiveQuota = async (options?: { silent?: boolean }) => {
    // Agen ringan dibaca paralel; Antigravity (membuka PTY ±6 dtk) menyusul sendiri agar tidak berebut CPU.
    // Penulisan ke penyimpanan tetap berurutan agar tidak saling menimpa.
    const read = async (id: string) => {
      const [profile, stats] = await Promise.all([fetchUserCliProfile(id), fetchLiveAgentTokenStats(id)]);
      return { id, profile, stats };
    };
    const light = await Promise.all(AGENT_IDS.filter((id) => id !== HEAVY_AGENT_ID).map(read));
    const fetched = [...light, await read(HEAVY_AGENT_ID)];
    let latest: Record<string, CredentialRecord> | null = null;
    for (const { id, profile, stats } of fetched) {
      await sorajaDb.applyCliProfile(id, profile);
      latest = await sorajaDb.syncLiveQuota(id, stats);
    }
    if (latest) setCredentials({ ...latest });
    if (options?.silent !== true) showDbToast('Akun, paket & kuota disinkronkan langsung dari mesin CLI.');
  };

  /** Status terpasang saja (cepat). Dipakai saat startup & membuka wizard "ganti agen": tidak menjalankan CLI. */
  const refreshInstalledStatus = async () => {
    const statuses = await fetchInstalledCliStatuses();
    if (statuses.length === 0) return;
    setInstalledCliAgents(Object.fromEntries(statuses.map((s) => [s.id, s])));
  };

  const refreshAgentProviders = async () => {
    try {
      const providers = await fetchAuthoritativeAgentProviders();
      if (providers.length === 0) return;
      setAgentProviders(providers);
      const cliMap: Record<string, CliAgentStatus> = {};
      for (const p of providers) {
        cliMap[p.id] = {
          id: p.id,
          name: p.name,
          executable: p.executable || p.id,
          is_installed: !!p.isInstalled,
          path: p.binaryPath,
          vendor: p.vendor,
          description: p.description || '',
        };
      }
      setInstalledCliAgents(cliMap);
      setSelectedAgent((prev) => {
        const match = providers.find((p) => p.id === prev.id) || providers[0];
        setSelectedModel((prevModel) => match.models.find((m) => m.id === prevModel.id) || match.models[0] || DEFAULT_FALLBACK_MODEL);
        return match;
      });
    } catch (e) {
      console.warn('Gagal memuat katalog agen dari backend:', e);
    }
  };

  useEffect(() => {
    // Bertahap: status terpasang (milidetik) → jeda agar UI interaktif → model live → akun & kuota.
    (async () => {
      await refreshInstalledStatus();
      await sleep(STARTUP_PROBE_DELAY_MS);
      await refreshAgentProviders();
      await handleSyncLiveQuota({ silent: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pastikan direktori kerja aktif selalu terpercaya oleh mesin CLI
  useEffect(() => {
    if (activeProject && selectedAgent) {
      ensureWorkspaceTrustedForCli(activeProject.path, selectedAgent.id).catch(() => {});
    }
  }, [activeProject?.path, selectedAgent?.id]);

  const applyLiveModels = (agent: AgentProvider, liveModels: ModelItem[]) => {
    const models = liveModels.length > 0 ? liveModels : agent.models;
    setAgentProviders((prev) => prev.map((p) => (p.id === agent.id ? { ...p, models } : p)));
    setSelectedAgent({ ...agent, models });
    setSelectedModel(
      models[0] || {
        ...DEFAULT_FALLBACK_MODEL,
        id: agent.defaultModelId || 'cli-default',
        name: agent.defaultModelId || `${agent.name} CLI Default`,
      }
    );
  };

  // Ref ke nilai terbaru agar pemilihan agen async tidak memakai state usang
  const providersRef = useRef(agentProviders);
  providersRef.current = agentProviders;
  const selectedAgentIdRef = useRef(selectedAgent.id);
  selectedAgentIdRef.current = selectedAgent.id;

  /**
   * Satu-satunya jalur ganti agen (Chat GUI, percakapan, tab terminal). Agen & model selalu
   * diganti bersamaan sehingga tidak pernah terjadi agen Codex dengan model Gemini.
   */
  const selectAgentById = async (agentId: string, preferredModelId?: string) => {
    const base = providersRef.current.find((p) => p.id === agentId);
    if (!base) return;
    const pick = (models: ModelItem[]) =>
      models.find((m) => m.id === preferredModelId) || models[0] || { ...DEFAULT_FALLBACK_MODEL, name: `${base.name} CLI Default` };
    selectedAgentIdRef.current = agentId;
    setSelectedAgent(base);
    setSelectedModel(pick(base.models));
    if (activeProject) ensureWorkspaceTrustedForCli(activeProject.path, agentId).catch(() => {});

    const live = await fetchAuthoritativeAgentModels(agentId).catch(() => [] as ModelItem[]);
    if (live.length === 0) return;
    setAgentProviders((prev) => prev.map((p) => (p.id === agentId ? { ...p, models: live } : p)));
    if (selectedAgentIdRef.current !== agentId) return; // pengguna sudah pindah agen lain
    setSelectedAgent({ ...base, models: live });
    setSelectedModel((current) => live.find((m) => m.id === current.id) || pick(live));
  };

  const handleSelectAgent = (agent: AgentProvider) => selectAgentById(agent.id);

  return {
    agentProviders,
    setAgentProviders,
    selectedAgent,
    setSelectedAgent,
    selectedModel,
    setSelectedModel,
    installedCliAgents,
    refreshAgentProviders,
    refreshInstalledStatus,
    handleSelectAgent,
    selectAgentById,
    handleSyncLiveQuota,
    syncAgentAccount,
    applyLiveModels,
  };
}
