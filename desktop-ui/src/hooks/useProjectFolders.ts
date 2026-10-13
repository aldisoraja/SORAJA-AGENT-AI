/**
 * useProjectFolders.ts
 * Onboarding workspace: pilih folder → simpan proyek → (opsional) buat percakapan awal.
 */
import { useRef, type Dispatch, type SetStateAction } from 'react';
import { sorajaDb, type ConversationRecord, type CredentialRecord, type MessageRecord, type ProjectRecord } from '../services/db';
import type { CliAgentStatus } from '../services/cliAdapters';
import type { AgentProvider, ModelItem } from '../types/agent';

type DbHealth = Awaited<ReturnType<typeof sorajaDb.getDatabaseHealth>>;

interface ProjectFoldersDeps {
  projects: ProjectRecord[];
  activeProject: ProjectRecord | null;
  activeConversation: ConversationRecord | null;
  selectedAgent: AgentProvider;
  selectedModel: ModelItem;
  installedCliAgents: Record<string, CliAgentStatus>;
  credentials: Record<string, CredentialRecord>;
  pickedFolderName: string;
  pickedFolderPath: string;
  setProjects: Dispatch<SetStateAction<ProjectRecord[]>>;
  setActiveProject: Dispatch<SetStateAction<ProjectRecord | null>>;
  setConversations: Dispatch<SetStateAction<ConversationRecord[]>>;
  setActiveConversation: Dispatch<SetStateAction<ConversationRecord | null>>;
  setMessages: Dispatch<SetStateAction<MessageRecord[]>>;
  setSelectedAgent: Dispatch<SetStateAction<AgentProvider>>;
  setSelectedModel: Dispatch<SetStateAction<ModelItem>>;
  setConnectModalProvider: Dispatch<SetStateAction<AgentProvider | null>>;
  setIsNewProjectModalOpen: Dispatch<SetStateAction<boolean>>;
  setWizardStep: Dispatch<SetStateAction<1 | 2 | 3>>;
  setPickedFolderName: Dispatch<SetStateAction<string>>;
  setPickedFolderPath: Dispatch<SetStateAction<string>>;
  setDbHealth: Dispatch<SetStateAction<DbHealth | null>>;
  refreshFiles: (path: string, dirHandle?: any) => Promise<unknown> | void;
  showDbToast: (msg: string) => void;
  /** Dipanggil setelah proyek selesai dibuat, untuk navigasi mode tampilan (chat/terminal). */
  onNavigateAfterCreate?: (project: ProjectRecord, agent: AgentProvider, mode: WorkspaceMode) => void;
}

export type WorkspaceMode = 'chat' | 'terminal';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface PickedFolder {
  name: string;
  /** Path absolut (desktop). Di browser hanya nama folder karena API web tidak mengekspos path. */
  path: string;
  dirHandle?: any;
}

const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

const normalize = (p: string) => p.toLowerCase().replace(/\\/g, '/');

function newProject(name: string, path: string): ProjectRecord {
  const now = new Date().toISOString();
  return { id: `proj-${Date.now()}`, name, path, branch: 'main', color: '#06b6d4', isPinned: false, createdAt: now, updatedAt: now };
}

function newConversation(projectId: string, title: string, agentId: string, modelId: string): ConversationRecord {
  const now = new Date().toISOString();
  return { id: `conv-${Date.now()}`, projectId, title, agentId, modelId, status: 'active', timeAgo: 'Baru saja', createdAt: now, updatedAt: now };
}

/** Dialog folder native (tauri-plugin-dialog) di desktop; File System Access API di browser dev. */
async function pickDirectory(): Promise<PickedFolder | null> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    const selected = await invoke<string | string[] | null>('plugin:dialog|open', {
      options: { directory: true, multiple: false, title: 'Pilih folder proyek' },
    }).catch((err) => {
      console.warn('Dialog folder gagal:', err);
      return null;
    });
    const path = Array.isArray(selected) ? selected[0] : selected;
    return path ? { name: baseName(path), path: path.replace(/\\/g, '/') } : null;
  }
  if (!('showDirectoryPicker' in window)) return null;
  try {
    const handle = await (window as any).showDirectoryPicker({ id: 'soraja_workspace_picker', mode: 'read' });
    return handle?.name ? { name: handle.name, path: handle.name, dirHandle: handle } : null;
  } catch (err: any) {
    if (err?.name !== 'AbortError') console.warn('showDirectoryPicker error:', err);
    return null;
  }
}

export function useProjectFolders(d: ProjectFoldersDeps) {
  // Handle folder (browser) & mode tertunda (untuk alur Hubungkan Agen → lanjut buat proyek)
  const pickedDirHandleRef = useRef<any>(undefined);
  const pendingModeRef = useRef<WorkspaceMode>('chat');

  const resetWizard = () => {
    d.setIsNewProjectModalOpen(false);
    d.setWizardStep(1);
    d.setPickedFolderName('');
    d.setPickedFolderPath('');
  };

  const saveAndActivateProject = async (proj: ProjectRecord) => {
    d.setProjects(await sorajaDb.saveProject(proj));
    d.setActiveProject(proj);
  };

  const startConversation = async (conv: ConversationRecord) => {
    d.setConversations(await sorajaDb.createConversation(conv));
    d.setActiveConversation(conv);
    d.setMessages([]);
  };

  const refreshHealth = async () => d.setDbHealth(await sorajaDb.getDatabaseHealth());

  const handleFinishProjectCreation = async (agentToUse: AgentProvider, mode?: WorkspaceMode) => {
    if (mode) pendingModeRef.current = mode;
    const chosenMode = mode ?? pendingModeRef.current;
    const model = agentToUse.models[0];
    if (!d.installedCliAgents[agentToUse.id]?.is_installed && !d.credentials[agentToUse.id]?.isConnected) {
      d.setSelectedAgent(agentToUse);
      d.setSelectedModel(model);
      d.setConnectModalProvider(agentToUse);
      return;
    }

    // Mengganti agen untuk ruang kerja aktif yang sudah ada
    if (!d.pickedFolderName && d.activeProject) {
      d.setSelectedAgent(agentToUse);
      d.setSelectedModel(model);
      if (d.activeConversation) {
        const updated = { ...d.activeConversation, agentId: agentToUse.id, modelId: model.id };
        d.setConversations(await sorajaDb.createConversation(updated));
        d.setActiveConversation(updated);
      }
      d.setIsNewProjectModalOpen(false);
      d.showDbToast(`Agen aktif dialihkan ke ${agentToUse.name} (${model.name}).`);
      return;
    }

    const folderName = d.pickedFolderName || 'Proyek Baru';
    const folderPath = d.pickedFolderPath || d.pickedFolderName;

    const proj = newProject(folderName, folderPath);
    await saveAndActivateProject(proj);
    await d.refreshFiles(folderPath, pickedDirHandleRef.current);
    await startConversation(newConversation(proj.id, 'Sesi Vibe Coding - ' + folderName, agentToUse.id, model.id));

    d.setSelectedAgent(agentToUse);
    d.setSelectedModel(model);
    pickedDirHandleRef.current = undefined;
    resetWizard();
    await refreshHealth();
    d.showDbToast(`Proyek "${proj.name}" berhasil dibuat & disimpan di SQLite.`);

    d.onNavigateAfterCreate?.(proj, agentToUse, chosenMode);
  };

  /** Langkah 1: hanya simpan pilihan folder; modal tetap terbuka. */
  const handlePickFolderDirectly = async () => {
    const picked = await pickDirectory();
    if (!picked) return;
    pickedDirHandleRef.current = picked.dirHandle;
    d.setPickedFolderName(picked.name);
    d.setPickedFolderPath(picked.path);
  };

  /** Terminal multi-tab: daftarkan repo tanpa membuat percakapan chat baru. */
  const handlePickFolderOnly = async (): Promise<ProjectRecord | null> => {
    const picked = await pickDirectory();
    if (!picked) return null;
    const { name: folderName, path: folderPath } = picked;
    const existing = d.projects.find((p) => normalize(p.path) === normalize(folderPath));
    if (existing) {
      d.setActiveProject(existing);
      d.showDbToast(`Direktori kerja aktif: "${existing.name}".`);
      return existing;
    }
    const proj = newProject(folderName, folderPath);
    await saveAndActivateProject(proj);
    await d.refreshFiles(folderPath, picked.dirHandle);
    await refreshHealth();
    d.showDbToast(`Repo "${folderName}" berhasil ditambahkan! Silakan pilih mesin AI.`);
    return proj;
  };

  return { handleFinishProjectCreation, handlePickFolderDirectly, handlePickFolderOnly };
}
