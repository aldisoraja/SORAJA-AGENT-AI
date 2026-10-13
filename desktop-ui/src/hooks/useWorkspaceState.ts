import { useState, useEffect, useRef, type MouseEvent } from 'react';
import {
  sorajaDb,
  type ProjectRecord,
  type ConversationRecord,
  type MessageRecord,
  type AppSettings,
  type CredentialRecord,
  type ScheduledTaskRecord,
  type CodeEditChunk,
} from '../services/db';
import { useAgentAccounts } from './useAgentAccounts';
import { useChatGeneration } from './useChatGeneration';
import { useProjectFolders } from './useProjectFolders';
import type { AgentProvider } from '../types/agent';
import type { ConfirmDialogData } from '../components/modals/ConfirmDialogModal';
import { useAppTheme } from './useAppTheme';
import { useWorkspaceFiles } from './useWorkspaceFiles';


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
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTaskRecord[]>([]);
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

      const [loadedProjects, loadedConvs, loadedSettings, loadedCreds, loadedTasks, health] = await Promise.all([
        sorajaDb.getProjects(),
        sorajaDb.getConversations(),
        sorajaDb.getSettings(),
        sorajaDb.getCredentials(),
        sorajaDb.getScheduledTasks(),
        sorajaDb.getDatabaseHealth(),
      ]);

      setProjects(loadedProjects);
      setConversations(loadedConvs);
      setSettings(loadedSettings);
      setCredentials(loadedCreds);
      setScheduledTasks(loadedTasks);
      setDbHealth(health);

      if (loadedProjects.length > 0) {
        const firstProj = loadedProjects[0];
        setActiveProject(firstProj);

        const projConvs = loadedConvs.filter((c) => c.projectId === firstProj.id);
        if (projConvs.length > 0) {
          const firstConv = projConvs[0];
          setActiveConversation(firstConv);
          const initialMsgs = await sorajaDb.getMessages(firstConv.id);
          setMessages(initialMsgs);
        } else {
          setActiveConversation(null);
          setMessages([]);
        }
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

  // 4. Agen & akun (dinamis dari CLI) + state modal
  const accounts = useAgentAccounts({ activeProject, setCredentials, showDbToast });
  const { agentProviders, selectedAgent, setSelectedAgent, selectedModel, setSelectedModel, installedCliAgents } = accounts;
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isTasksModalOpen, setIsTasksModalOpen] = useState(false);
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

  const handleSelectConversation = async (project: ProjectRecord, conv: ConversationRecord) => {
    setActiveProject(project);
    setActiveConversation(conv);
    // Agen & model mengikuti percakapan yang dibuka (mencegah header Codex dengan model Gemini)
    if (conv.agentId && conv.agentId !== selectedAgent.id) {
      accounts.selectAgentById(conv.agentId, conv.modelId);
    }
    const msgs = await sorajaDb.getMessages(conv.id);
    setMessages(msgs);
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

  const handleCreateNewConversation = async () => {
    if (!activeProject) return;

    const newConv: ConversationRecord = {
      id: `conv-${Date.now()}`,
      projectId: activeProject.id,
      title: 'Percakapan Baru ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      agentId: selectedAgent.id,
      modelId: selectedModel.id,
      status: 'active',
      timeAgo: 'Baru saja',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedConvs = await sorajaDb.createConversation(newConv);
    setConversations(updatedConvs);
    setActiveConversation(newConv);
    setMessages([]);

    // Naikkan proyek ke posisi teratas (LRU reordering)
    const updatedProjects = await sorajaDb.touchProject(activeProject.id);
    setProjects(updatedProjects);

    const health = await sorajaDb.getDatabaseHealth();
    setDbHealth(health);
    showDbToast('Sesi percakapan baru dimulai.');
  };

  const handleTogglePinProject = async (projectId: string, e: MouseEvent) => {
    e.stopPropagation();
    const updated = await sorajaDb.togglePinProject(projectId);
    setProjects(updated);
    showDbToast('Status pin project diperbarui di DB.');
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
            const nextConvs = remainingConvs.filter((c) => c.projectId === updated[0].id);
            if (nextConvs.length > 0) {
              setActiveConversation(nextConvs[0]);
              const msgs = await sorajaDb.getMessages(nextConvs[0].id);
              setMessages(msgs);
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
    setActiveProject(proj);
    setCollapsedProjects((prev) => ({ ...prev, [proj.id]: false }));

    const newConv: ConversationRecord = {
      id: `conv-${Date.now()}`,
      projectId: proj.id,
      title: 'Percakapan Baru ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      agentId: selectedAgent.id,
      modelId: selectedModel.id,
      status: 'active',
      timeAgo: 'Baru saja',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedConvs = await sorajaDb.createConversation(newConv);
    setConversations(updatedConvs);
    setActiveConversation(newConv);
    setMessages([]);

    // Naikkan proyek ke posisi teratas (LRU reordering)
    const updatedProjects = await sorajaDb.touchProject(proj.id);
    setProjects(updatedProjects);

    const health = await sorajaDb.getDatabaseHealth();
    setDbHealth(health);
    showDbToast(`Percakapan baru dibuat di ${proj.name}.`);
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
      chatReasoningEffort: 'Kedalaman penalaran Chat',
      theme: 'Tema',
      accentColor: 'Warna aksen',
    };
    showDbToast(`✓ ${labels[key] ?? 'Pengaturan'} disimpan.`);
  };

  const handleSaveMultipleSettings = async (partial: Partial<AppSettings>) => {
    if (!settings) return;
    const updated = await sorajaDb.saveSettings(partial);
    setSettings(updated);
    showDbToast('✓ Tampilan diperbarui.');
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
    scheduledTasks,
    setScheduledTasks,
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
    isTasksModalOpen,
    setIsTasksModalOpen,
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
    handleCreateNewConversation,
    handleTogglePinProject,
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
    refreshInstalledCliAgents: accounts.refreshAgentProviders,
  };
}

export type WorkspaceState = ReturnType<typeof useWorkspaceState>;
