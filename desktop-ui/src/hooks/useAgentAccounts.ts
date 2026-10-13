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
  fetchLiveAgentTokenStats,
  fetchUserCliProfile,
  type CliAgentStatus,
} from '../services/cliAdapters';
import type { AgentProvider, ModelItem } from '../types/agent';
import { AGENT_PROVIDERS } from '../constants/agentProviders';

export const DEFAULT_FALLBACK_MODEL: ModelItem = {
  id: 'cli-default',
  name: 'Pilih Model CLI',
  speed: 'Live',
  desc: 'Model dimuat langsung dari CLI agen',
};

const AGENT_IDS = ['antigravity', 'claude', 'codex', 'opencode'];

interface AgentAccountsDeps {
  activeProject: ProjectRecord | null;
  setCredentials: Dispatch<SetStateAction<Record<string, CredentialRecord>>>;
  showDbToast: (msg: string) => void;
}

export function useAgentAccounts({ activeProject, setCredentials, showDbToast }: AgentAccountsDeps) {
  const [agentProviders, setAgentProviders] = useState<AgentProvider[]>(AGENT_PROVIDERS);
  const [selectedAgent, setSelectedAgent] = useState<AgentProvider>(AGENT_PROVIDERS[0]);
  const [selectedModel, setSelectedModel] = useState<ModelItem>(AGENT_PROVIDERS[0]?.models?.[0] || DEFAULT_FALLBACK_MODEL);
  const [installedCliAgents, setInstalledCliAgents] = useState<Record<string, CliAgentStatus>>({});

  /** Profil (login, email, paket) + kuota untuk satu agen, langsung dari CLI. */
  const syncAgentAccount = async (agentId: string) => {
    const [profile, stats] = await Promise.all([fetchUserCliProfile(agentId), fetchLiveAgentTokenStats(agentId)]);
    await sorajaDb.applyCliProfile(agentId, profile);
    return sorajaDb.syncLiveQuota(agentId, stats);
  };

  /** Dipanggil juga dari tombol UI (argumen bisa berupa event) → hanya `{ silent: true }` yang membisukan toast. */
  const handleSyncLiveQuota = async (options?: { silent?: boolean }) => {
    let latest: Record<string, CredentialRecord> | null = null;
    for (const id of AGENT_IDS) {
      latest = await syncAgentAccount(id);
    }
    if (latest) setCredentials({ ...latest });
    if (options?.silent !== true) showDbToast('Akun, paket & kuota disinkronkan langsung dari mesin CLI.');
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
    (async () => {
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
    handleSelectAgent,
    selectAgentById,
    handleSyncLiveQuota,
    syncAgentAccount,
    applyLiveModels,
  };
}
