import { useState, useEffect, useRef, type MouseEvent } from 'react';
import {
  sorajaDb,
  type ProjectRecord,
  type ConversationRecord,
  type MessageRecord,
  type AppSettings,
  type CredentialRecord,
  type CodeEditChunk,
} from '../services/db';
import { useAgentAccounts } from './useAgentAccounts';
import { useChatGeneration } from './useChatGeneration';
import { useProjectFolders } from './useProjectFolders';
import type { AgentProvider } from '../types/agent';
import type { ConfirmDialogData } from '../components/modals/ConfirmDialogModal';
import { useAppTheme } from './useAppTheme';
import { useDisplayPreferences } from './useDisplayPreferences';
import { useFinishNotifier } from './useFinishNotifier';
import { useWorkspaceFiles } from './useWorkspaceFiles';
import {
  NEW_CHAT_TITLE,
  isCliConversation,
  isPlaceholderTitle,
  pickResumableChat,
  uniqueConversationTitle,
} from '../utils/conversationTitle';


export function useWorkspaceState() {
  // 1. Dynamic Database States
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const { workspaceFiles, isScanningFiles, refreshFiles, setWorkspaceFiles } = useWorkspaceFiles(activeProject);
  const [activeConversation, setActiveConversation] = useState<ConversationRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [credentials, setCredentials] = useState<Record<string, CredentialRecord>>({});
  const [dbHealth, setDbHealth] = useState<{ mode: string; totalProjects: number; totalSessions: number; totalMessages: number; sizeKb: string } | null>(null);

  // Dynamic Collapsed States & Toast Feedback
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogData | null>(null);

  const showDbToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 2. Load from DB on Mount
  useEffect(() => {
    async function loadFromDb() {
      setIsLoadingDb(true);
      await sorajaDb.init();

      const [loadedProjects, loadedConvs, loadedSettings, loadedCreds, health] = await Promise.all([
        sorajaDb.getProjects(),
        sorajaDb.getConversations(),
        sorajaDb.getSettings(),
        sorajaDb.getCredentials(),
        sorajaDb.getDatabaseHealth(),
      ]);

      setProjects(loadedProjects);
      setConversations(loadedConvs);
      setSettings(loadedSettings);
      setCredentials(loadedCreds);
      setDbHealth(health);

      if (loadedProjects.length > 0) {
        const firstProj = loadedProjects[0];
        // Sesi chat baru disiapkan oleh effect "startup" di bawah; sesi lama tetap tersimpan di sidebar
        setActiveProject(firstProj);
        setActiveConversation(null);
        setMessages([]);
      } else {
        setActiveProject(null);
        setActiveConversation(null);
        setMessages([]);
      }

      setIsLoadingDb(false);
    }

    loadFromDb();
  }, []);

  // 3. Reactive Theme & Appearance
  const theme = useAppTheme(settings);
  useDisplayPreferences(settings);

  // 4. Agen & akun (dinamis dari CLI) + state modal
  const accounts = useAgentAccounts({ activeProject, setCredentials, showDbToast });
  const { agentProviders, selectedAgent, setSelectedAgent, selectedModel, setSelectedModel, installedCliAgents } = accounts;
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isFavoritesModalOpen, setIsFavoritesModalOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [pickedFolderName, setPickedFolderName] = useState('');
  const [pickedFolderPath, setPickedFolderPath] = useState('');
  // Diisi oleh App: navigasi mode tampilan setelah proyek selesai dibuat
  const navigateAfterCreateRef = useRef<
    ((proj: ProjectRecord, agent: AgentProvider, mode: 'chat' | 'terminal') => void) | null
  >(null);

  const [connectModalProvider, setConnectModalProvider] = useState<AgentProvider | null>(null);
  const [activeDiffReview, setActiveDiffReview] = useState<{
    isOpen: boolean;
    files: CodeEditChunk[];
    activeFileIndex: number;
    turnPrompt?: string;
  } | null>(null);
  const [hitlModal, setHitlModal] = useState<{
    open: boolean;
    command: string;
    selectedOption: number;
  } | null>(null);

  // 5. Sidebar & Conversation Handlers
  const [projectFilterQuery, setProjectFilterQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'pinned' | 'active'>('all');

  // Token seleksi: hasil async (pemuatan pesan) dari pilihan lama dibuang bila pengguna sudah memilih yang lain
  const selectionSeq = useRef(0);

  /** Memilih proyek: melanjutkan sesi chat terakhir bila dibuat hari ini, selain itu draf kosong (belum disimpan). */
  const handleSelectProject = async (proj: ProjectRecord, options?: { force?: boolean }) => {
    if (!options?.force && activeProject?.id === proj.id) return;
    const seq = ++selectionSeq.current;
    setActiveProject(proj);
    const conv = pickResumableChat(await sorajaDb.getConversations(), proj.id);
    if (seq !== selectionSeq.current) return;
    setActiveConversation(conv);
    setMessages([]);
    if (!conv) return;
    const msgs = await sorajaDb.getMessages(conv.id);
    if (seq === selectionSeq.current) setMessages(msgs);
  };

  const handleSelectConversation = async (project: ProjectRecord, conv: ConversationRecord) => {
    const seq = ++selectionSeq.current;
    setActiveProject(project);
    setActiveConversation(conv);
    // Agen & model mengikuti percakapan yang dibuka (mencegah header Codex dengan model Gemini)
    if (conv.agentId && conv.agentId !== selectedAgent.id) {
      accounts.selectAgentById(conv.agentId, conv.modelId);
    }
    const msgs = await sorajaDb.getMessages(conv.id);
    if (seq === selectionSeq.current) setMessages(msgs);
  };

  const touchProjectActivity = async (projectId: string) => {
    if (!projectId) return;
    const updated = await sorajaDb.touchProject(projectId);
    setProjects(updated);
  };

  const touchProjectActivityByPath = async (path: string) => {
    if (!path) return;
    const updated = await sorajaDb.touchProjectByPath(path);
    setProjects(updated);
  };

  /**
   * Menyiapkan sesi chat kosong yang tersimpan (tampil di sidebar berjudul "Percakapan baru").
   * Saat startup memakai ulang sesi kosong yang ada; klik eksplisit pengguna (forceNew) selalu membuat sesi baru.
   */
  const ensureEmptyChat = async (proj: ProjectRecord, forceNew = false): Promise<{ conv: ConversationRecord; reused: boolean }> => {
    const all = await sorajaDb.getConversations();
    const mine = all.filter((c) => c.projectId === proj.id && !isCliConversation(c));
    for (const c of forceNew ? [] : mine) {
      if (isPlaceholderTitle(c.title) && (await sorajaDb.getMessages(c.id)).length === 0) {
        return { conv: c, reused: true };
      }
    }
    const now = new Date().toISOString();
    const conv: ConversationRecord = {
      id: `conv-${Date.now()}`,
      projectId: proj.id,
      title: uniqueConversationTitle(NEW_CHAT_TITLE, mine.map((c) => c.title)),
      agentId: selectedAgent.id,
      modelId: selectedModel.id,
      status: 'active',
      timeAgo: 'Baru saja',
      createdAt: now,
      updatedAt: now,
    };
    setConversations(await sorajaDb.createConversation(conv));
    return { conv, reused: false };
  };

  /** "Mulai sesi chat baru": membuat sesi kosong tersimpan & membukanya; sesi lama tetap utuh. */
  const startNewChat = async (proj: ProjectRecord, options?: { forceNew?: boolean }) => {
    const seq = ++selectionSeq.current;
    setActiveProject(proj);
    setCollapsedProjects((prev) => ({ ...prev, [proj.id]: false }));
    const { conv, reused } = await ensureEmptyChat(proj, options?.forceNew);
    if (seq !== selectionSeq.current) return;
    setActiveConversation(conv);
    setMessages([]);
    showDbToast(reused ? 'Sesi chat kosong dibuka kembali.' : 'Sesi chat baru dibuat.');
  };

  // Saat aplikasi dibuka: pindah ke sesi chat baru (kosong) di proyek teratas.
  // Dijalankan sekali setelah data SQLite selesai dimuat (isLoadingDb=false), memakai daftar proyek yang sudah dimuat.
  const startupChatDone = useRef(false);
  useEffect(() => {
    if (isLoadingDb || startupChatDone.current) return;
    startupChatDone.current = true;
    const target = activeProject ?? projects[0];
    if (target) void startNewChat(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingDb]);

  const handleTogglePinProject = async (projectId: string, e: MouseEvent) => {
    e.stopPropagation();
    const updated = await sorajaDb.togglePinProject(projectId);
    setProjects(updated);
    showDbToast('Status pin project diperbarui di DB.');
  };

  const handleToggleFavoriteConversation = async (convId: string, e?: MouseEvent) => {
    e?.stopPropagation();
    setConversations(await sorajaDb.toggleFavoriteConversation(convId));
  };

  const handleDeleteProject = (projectId: string, e: MouseEvent) => {
    e.stopPropagation();
    const proj = projects.find((p) => p.id === projectId);
    const projName = proj?.name || 'Proyek';

    setConfirmDialog({
      isOpen: true,
      title: 'Hapus Workspace Proyek',
      description: `Apakah Anda yakin ingin menghapus workspace "${projName}" beserta seluruh riwayat percakapan dan log sesi terkait dari SQLite database?`,
      itemHighlight: `${projName} • ${proj?.path || ''}`,
      confirmText: 'Ya, Hapus Proyek',
      cancelText: 'Batalkan',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(null);
        const updated = await sorajaDb.deleteProject(projectId);
        setProjects(updated);

        const remainingConvs = await sorajaDb.getConversations();
        setConversations(remainingConvs);

        if (activeProject?.id === projectId) {
          if (updated.length > 0) {
            setActiveProject(updated[0]);
            const nextConv = pickResumableChat(remainingConvs, updated[0].id);
            if (nextConv) {
              setActiveConversation(nextConv);
              setMessages(await sorajaDb.getMessages(nextConv.id));
            } else {
              setActiveConversation(null);
              setMessages([]);
            }
          } else {
            setActiveProject(null);
            setActiveConversation(null);
            setMessages([]);
          }
        }

        const health = await sorajaDb.getDatabaseHealth();
        setDbHealth(health);
        showDbToast(`Proyek "${projName}" berhasil dihapus dari database.`);
      },
    });
  };

  const toggleProjectCollapsed = (projectId: string) => {
    setCollapsedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const handleCreateConversationForProject = async (proj: ProjectRecord, e: MouseEvent) => {
    e.stopPropagation();
    await startNewChat(proj, { forceNew: true });
  };

  // 6. Chat GUI (CLI headless) & onboarding folder
  const generation = useChatGeneration({
    activeProject,
    activeConversation,
    selectedAgent,
    selectedModel,
    settings,
    credentials,
    installedCliAgents,
    workspaceFiles,
    setMessages,
    setProjects,
    setConversations,
    setActiveConversation,
    setExpandedReasoning,
    showDbToast,
  });
  useFinishNotifier(generation.isGenerating, messages, settings?.notifyOnFinish ?? true);

  const folders = useProjectFolders({
    projects,
    activeProject,
    activeConversation,
    selectedAgent,
    selectedModel,
    installedCliAgents,
    credentials,
    pickedFolderName,
    pickedFolderPath,
    setProjects,
    setActiveProject,
    setConversations,
    setActiveConversation,
    setMessages,
    setSelectedAgent,
    setSelectedModel,
    setConnectModalProvider,
    setIsNewProjectModalOpen,
    setWizardStep,
    setPickedFolderName,
    setPickedFolderPath,
    setDbHealth,
    refreshFiles,
    showDbToast,
    onNavigateAfterCreate: (proj, agent, mode) => navigateAfterCreateRef.current?.(proj, agent, mode),
  });

  // 7. Aktifkan agen dari modal "Hubungkan": akun, paket & kuota dibaca dari login CLI
  const handleUseAgent = async (provider: AgentProvider) => {
    setCredentials(await accounts.syncAgentAccount(provider.id));
    await accounts.selectAgentById(provider.id);
    setConnectModalProvider(null);
    showDbToast(`${provider.name} siap digunakan.`);
    if (isNewProjectModalOpen && pickedFolderName) {
      setTimeout(() => folders.handleFinishProjectCreation(provider), 100);
    }
  };

  // 8. Settings Helpers
  const handleSaveSettingsField = async <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    if (!settings) return;
    const updated = await sorajaDb.saveSettings({ [key]: val });
    setSettings(updated);
    const labels: Partial<Record<keyof AppSettings, string>> = {
      securityPreset: 'Mode kerja AI',
      verboseAgentChat: 'Tampilan proses berpikir',
      conversationWidth: 'Lebar area obrolan',
      chatReasoningEffort: 'Ketelitian AI',
      theme: 'Tema',
      accentColor: 'Warna aksen',
      uiScale: 'Ukuran tampilan',
      reduceMotion: 'Kurangi animasi',
      notifyOnFinish: 'Pemberitahuan selesai',
    };
    showDbToast(`✓ ${labels[key] ?? 'Pengaturan'} disimpan.`);
  };

  const handleSaveMultipleSettings = async (partial: Partial<AppSettings>) => {
    if (!settings) return;
    const updated = await sorajaDb.saveSettings(partial);
    setSettings(updated);
    showDbToast('✓ Pengaturan diperbarui.');
  };

  const handleToggleCreditOverages = async () => {
    const updated = await sorajaDb.toggleCreditOverages('antigravity');
    setCredentials(updated);
    showDbToast(`Credit Overages ${updated.antigravity?.enableCreditOverages ? 'diaktifkan' : 'dinonaktifkan'}.`);
  };

  const handleDisconnectCredential = async (providerId: string) => {
    const updated = await sorajaDb.disconnectCredential(providerId);
    setCredentials(updated);
    showDbToast(`Koneksi ${providerId} telah diputuskan.`);
  };

  return {
    // DB & State
    isLoadingDb,
    projects,
    setProjects,
    conversations,
    setConversations,
    activeProject,
    setActiveProject,
    activeConversation,
    setActiveConversation,
    messages,
    settings,
    credentials,
    dbHealth,
    collapsedProjects,
    toastMessage,
    showDbToast,
    confirmDialog,
    setConfirmDialog,
    selectedAgent,
    setSelectedAgent,
    selectedModel,
    setSelectedModel,
    expandedReasoning,
    setExpandedReasoning,
    // Modals
    isSettingsOpen,
    setIsSettingsOpen,
    isHistoryModalOpen,
    setIsHistoryModalOpen,
    isFavoritesModalOpen,
    setIsFavoritesModalOpen,
    isNewProjectModalOpen,
    setIsNewProjectModalOpen,
    wizardStep,
    setWizardStep,
    navigateAfterCreateRef,
    pickedFolderName,
    setPickedFolderName,
    pickedFolderPath,
    setPickedFolderPath,
    connectModalProvider,
    setConnectModalProvider,
    activeDiffReview,
    setActiveDiffReview,
    hitlModal,
    setHitlModal,
    projectFilterQuery,
    setProjectFilterQuery,
    filterTab,
    setFilterTab,
    // Workspace Files State
    workspaceFiles,
    isScanningFiles,
    refreshFiles,
    setWorkspaceFiles,
    // Theme values
    ...theme,
    // Handlers
    handleSelectConversation,
    handleSelectProject,
    handleTogglePinProject,
    handleToggleFavoriteConversation,
    handleDeleteProject,
    ...generation,
    toggleProjectCollapsed,
    handleCreateConversationForProject,
    handleUseAgent,
    ...folders,
    handleSaveSettingsField,
    handleSaveMultipleSettings,
    handleToggleCreditOverages,
    handleSyncLiveQuota: accounts.handleSyncLiveQuota,
    handleDisconnectCredential,
    touchProjectActivity,
    touchProjectActivityByPath,
    agentProviders,
    refreshAgentProviders: accounts.refreshAgentProviders,
    handleSelectAgent: accounts.handleSelectAgent,
    selectAgentById: accounts.selectAgentById,
    installedCliAgents,
    refreshInstalledCliAgents: accounts.refreshInstalledStatus,
  };
}

export type WorkspaceState = ReturnType<typeof useWorkspaceState>;
