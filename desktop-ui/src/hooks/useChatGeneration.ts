/**
 * useChatGeneration.ts
 * Mode Chat GUI: kirim prompt ke CLI agen headless (atau mode demo bila CLI tidak tersedia),
 * kontrol Stop/Jeda, dan jembatan stream → pesan. Spesifikasi: specs/agent-protocols.md §2, §8.
 */
import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  sorajaDb,
  type AppSettings,
  type AttachedFile,
  type ConversationRecord,
  type CredentialRecord,
  type MessageRecord,
  type ProjectRecord,
} from '../services/db';
import { generateIntelligentAgentResponse } from '../services/agentEngine';
import {
  pauseHeadlessAgentSession,
  resumeHeadlessAgentSession,
  spawnHeadlessAgentSession,
  stopHeadlessAgentSession,
  type CliAgentStatus,
} from '../services/cliAdapters';
import type { AgentProvider, ModelItem } from '../types/agent';
import { hasHeadlessBridge, isTauriRuntime as isTauri } from '../services/headlessTransport';
import { useAgentStreamBridge, type ActiveGeneration } from './useAgentStreamBridge';
import { persistChatAttachments } from '../services/chatAttachmentStore';
import { buildChatPrompt } from '../services/cli/chatPrompt';
import {
  NEW_CHAT_TITLE,
  isCliConversation,
  isPlaceholderTitle,
  titleFromPrompt,
  uniqueConversationTitle,
} from '../utils/conversationTitle';

/** Agen yang menerima gambar langsung lewat flag CLI (selain daftar path di prompt). */
const NATIVE_IMAGE_AGENTS = ['codex', 'opencode'];

/** CLI headless bisa dijalankan: lewat Tauri IPC (desktop) atau jembatan Vite (browser dev). */
const canRunCli = isTauri || hasHeadlessBridge;

interface PendingRequest {
  prompt: string;
  attachments: AttachedFile[];
  agentMsgId: string;
  conversationId: string;
}
const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

interface ChatGenerationDeps {
  activeProject: ProjectRecord | null;
  activeConversation: ConversationRecord | null;
  selectedAgent: AgentProvider;
  selectedModel: ModelItem;
  settings: AppSettings | null;
  credentials: Record<string, CredentialRecord>;
  installedCliAgents: Record<string, CliAgentStatus>;
  workspaceFiles: string[];
  setMessages: Dispatch<SetStateAction<MessageRecord[]>>;
  setProjects: Dispatch<SetStateAction<ProjectRecord[]>>;
  setConversations: Dispatch<SetStateAction<ConversationRecord[]>>;
  setActiveConversation: Dispatch<SetStateAction<ConversationRecord | null>>;
  setExpandedReasoning: Dispatch<SetStateAction<Record<string, boolean>>>;
  showDbToast: (msg: string) => void;
}

export function useChatGeneration(d: ChatGenerationDeps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const activeGenRef = useRef<ActiveGeneration | null>(null);
  /** Permintaan CLI yang sedang berjalan; dipakai untuk fallback bila CLI gagal tanpa jawaban. */
  const pendingRef = useRef<PendingRequest | null>(null);

  useAgentStreamBridge({
    enabled: canRunCli,
    onCliFailure: (sessionId, summary) => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending || pending.agentMsgId !== sessionId) {
        // Dihentikan pengguna / sesi lain: cukup selesaikan status generasi.
        activeGenRef.current = null;
        setIsGenerating(false);
        setIsPaused(false);
        return;
      }
      d.showDbToast('CLI tidak merespons — memakai jawaban cadangan.');
      void runDemoFallback(pending.prompt, pending.attachments, sessionId, pending.conversationId, `gagal merespons (${summary})`);
    },
    activeGenRef,
    setMessages: d.setMessages,
    setIsGenerating,
    setIsPaused,
    showDbToast: d.showDbToast,
    persistMessage: (msg) => {
      sorajaDb.addMessage(msg).catch(() => {});
    },
    onCliSession: (conversationId, cliSessionId, agentId) => {
      d.setConversations((prev) => {
        const conv = prev.find((c) => c.id === conversationId);
        if (conv && (conv.cliSessionId !== cliSessionId || (agentId && conv.agentId !== agentId))) {
          const updated = { ...conv, cliSessionId, agentId: agentId || conv.agentId };
          sorajaDb.createConversation(updated).catch(() => {});
          d.setActiveConversation((cur) => (cur?.id === conversationId ? updated : cur));
          return prev.map((c) => (c.id === conversationId ? updated : c));
        }
        return prev;
      });
    },
  });

  const handleStopGeneration = async () => {
    const gen = activeGenRef.current;
    if (gen) {
      pendingRef.current = null;
      gen.timers?.forEach((t) => clearTimeout(t));
      // Hentikan dulu pelacakan agar event akhir dari proses yang dimatikan tidak menimpa status.
      activeGenRef.current = null;
      if (gen.pid) await stopHeadlessAgentSession(gen.pid, gen.agentMsgId);
      // Jawaban & jejak kerja parsial dipertahankan; hanya status yang diubah.
      d.setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== gen.agentMsgId) return m;
          const stopped: MessageRecord = {
            ...m,
            status: 'stopped',
            finishedAt: Date.now(),
            trajectory: (m.trajectory || []).map((s) => (s.status === 'running' ? { ...s, status: 'error' } : s)),
            content: `${m.content}${m.content.trim() ? '\n\n' : ''}> ⏹️ **Dihentikan oleh pengguna.** Jawaban di atas mungkin belum lengkap.`,
          };
          sorajaDb.addMessage(stopped).catch(() => {});
          return stopped;
        })
      );
    }
    setIsGenerating(false);
    setIsPaused(false);
    d.showDbToast('Proses agen berhasil dihentikan (Hard Stop).');
  };

  const handleTogglePauseGeneration = async () => {
    const pid = activeGenRef.current?.pid;
    if (!pid || !isTauri) return;
    setIsPaused((prev) => {
      const next = !prev;
      if (next) {
        pauseHeadlessAgentSession(pid);
        d.showDbToast('Sesi agen dijeda sementara (Pause).');
      } else {
        resumeHeadlessAgentSession(pid);
        d.showDbToast('Sesi agen dilanjutkan (Resume).');
      }
      return next;
    });
  };

  /** Jawaban cadangan kontekstual saat CLI tidak tersedia / gagal. `reason` menjelaskan penyebabnya. */
  const runDemoFallback = async (
    prompt: string,
    attachments: AttachedFile[],
    agentMsgId: string,
    conversationId: string,
    reason: string
  ) => {
    const { selectedAgent, selectedModel } = d;
    const aiResult = await generateIntelligentAgentResponse(
      prompt,
      attachments,
      selectedAgent,
      selectedModel,
      d.activeProject,
      d.credentials[selectedAgent.id]?.token || '',
      d.workspaceFiles
    );
    const finalMsg: MessageRecord = {
      id: agentMsgId,
      conversationId,
      sender: 'agent',
      content: `> ℹ️ **Mode cadangan** — CLI ${selectedAgent.executable} ${reason}. Jawaban di bawah disusun secara lokal, bukan dari agen sungguhan.\n\n${aiResult.content}`,
      reasoning: aiResult.reasoning,
      toolCall: aiResult.toolCall,
      trajectory: aiResult.trajectory,
      codeEdits: aiResult.codeEdits,
      timestamp: nowTime(),
      agentId: selectedAgent.id,
      agentName: selectedAgent.name,
      modelName: selectedModel.name,
      status: 'done',
      finishedAt: Date.now(),
      runInfo: { fallback: true, fallbackReason: reason },
    };
    d.setMessages(await sorajaDb.addMessage(finalMsg));
    setIsGenerating(false);
    activeGenRef.current = null;
  };

  const handleSendMessage = async (promptText: string, stagedAttachments: AttachedFile[]) => {
    const prompt = promptText.trim();
    const { activeProject, selectedAgent, selectedModel } = d;
    if (!prompt && stagedAttachments.length === 0) return;

    // Draf kosong → sesi baru disimpan sekarang, berjudul dari input pertama
    let activeConversation = d.activeConversation;
    if (!activeConversation) {
      if (!activeProject) return;
      const existing = await sorajaDb.getConversations(activeProject.id);
      const fallbackTitle = stagedAttachments[0]?.name || NEW_CHAT_TITLE;
      const now = new Date().toISOString();
      activeConversation = {
        id: `conv-${Date.now()}`,
        projectId: activeProject.id,
        title: uniqueConversationTitle(titleFromPrompt(prompt, fallbackTitle), existing.map((c) => c.title)),
        agentId: selectedAgent.id,
        modelId: selectedModel.id,
        status: 'active',
        timeAgo: 'Baru saja',
        createdAt: now,
        updatedAt: now,
      };
      d.setConversations(await sorajaDb.createConversation(activeConversation));
      d.setActiveConversation(activeConversation);
    } else if (
      !isCliConversation(activeConversation) &&
      isPlaceholderTitle(activeConversation.title) &&
      (await sorajaDb.getMessages(activeConversation.id)).length === 0
    ) {
      // Sesi kosong yang sudah tampil di sidebar: judul diambil dari input pertama
      const existing = await sorajaDb.getConversations(activeConversation.projectId);
      const fallbackTitle = stagedAttachments[0]?.name || NEW_CHAT_TITLE;
      const others = existing.filter((c) => c.id !== activeConversation!.id).map((c) => c.title);
      activeConversation = {
        ...activeConversation,
        title: uniqueConversationTitle(titleFromPrompt(prompt, fallbackTitle), others),
        agentId: selectedAgent.id,
        modelId: selectedModel.id,
      };
      d.setConversations(await sorajaDb.createConversation(activeConversation));
      d.setActiveConversation(activeConversation);
    }

    // Naikkan proyek ke paling atas saat pengguna mulai berinteraksi (LRU)
    if (activeProject) {
      sorajaDb.touchProject(activeProject.id).then(d.setProjects).catch(() => {});
    }
    setIsGenerating(true);
    setIsPaused(false);

    const attachments = [...stagedAttachments];
    const userMsgId = `usr-${Date.now()}`;
    const useRealCli = canRunCli && !!activeProject && (d.installedCliAgents[selectedAgent.id]?.is_installed ?? false);
    // Lampiran disimpan sebagai berkas agar bisa dibaca CLI; riwayat hanya menyimpan thumbnail + path.
    const persisted =
      useRealCli && activeProject && attachments.length > 0
        ? await persistChatAttachments(activeProject.path, userMsgId, attachments)
        : null;
    if (persisted && persisted.failed.length > 0) {
      d.showDbToast(`Lampiran gagal diteruskan ke agen: ${persisted.failed.join(', ')}`);
    }
    d.setMessages(
      await sorajaDb.addMessage({
        id: userMsgId,
        conversationId: activeConversation.id,
        sender: 'user',
        content: prompt,
        attachments: persisted?.records ?? attachments.map(({ dataUrl: _omit, ...rest }) => rest),
        timestamp: nowTime(),
      })
    );

    const agentMsgId = `agt-${Date.now()}`;
    const fallbackReason = !canRunCli
      ? 'tidak tersedia di browser ini (buka lewat Vite dev server atau aplikasi desktop)'
      : !activeProject
        ? 'tidak bisa dijalankan tanpa proyek aktif'
        : 'belum terpasang di komputer ini';
    const permissionMode = d.settings?.securityPreset === 'Permissive' ? 'autonomous' : 'safe';
    // Sesi CLI hanya bisa di-resume oleh agen yang sama
    const resumeId = activeConversation.agentId === selectedAgent.id ? activeConversation.cliSessionId : undefined;
    const effort = d.settings?.chatReasoningEffort ?? 'high';
    const promptFiles = persisted?.forPrompt ?? [];
    const initialAgentMsg: MessageRecord = {
      id: agentMsgId,
      conversationId: activeConversation.id,
      sender: 'agent',
      content: '',
      timestamp: nowTime(),
      agentId: selectedAgent.id,
      agentName: selectedAgent.name,
      modelName: selectedModel.name,
      status: 'running',
      startedAt: Date.now(),
      runInfo: useRealCli
        ? {
            workspace: activeProject?.path,
            permission: permissionMode,
            effort,
            resumedSession: resumeId,
            attachmentCount: promptFiles.length,
          }
        : { fallback: true, fallbackReason },
    };
    d.setMessages(await sorajaDb.addMessage(initialAgentMsg));
    d.setExpandedReasoning((prev) => ({ ...prev, [agentMsgId]: true }));
    activeGenRef.current = {
      agentMsgId,
      projectPath: activeProject?.path,
      conversationId: activeConversation.id,
      agentId: selectedAgent.id,
    };

    if (!useRealCli || !activeProject) {
      // Mode cadangan (specs/agent-protocols.md §8): hanya bila CLI belum terpasang / tanpa transport.
      await runDemoFallback(prompt, attachments, agentMsgId, activeConversation.id, fallbackReason);
      return;
    }
    pendingRef.current = { prompt, attachments, agentMsgId, conversationId: activeConversation.id };
    try {
      await spawnHeadlessAgentSession({
        sessionId: agentMsgId,
        agent: selectedAgent,
        prompt: buildChatPrompt(prompt, promptFiles, NATIVE_IMAGE_AGENTS.includes(selectedAgent.id)),
        projectPath: activeProject.path,
        modelId: selectedModel.id,
        cliSessionId: resumeId,
        permissionMode,
        effort,
        chatRules: true,
        imagePaths: promptFiles.filter((f) => f.kind === 'image').map((f) => f.path),
        // Hanya OpenCode yang memakai --file untuk dokumen; agen lain membaca dari daftar path di prompt.
        filePaths: promptFiles.filter((f) => f.kind === 'document').map((f) => f.path),
      });
    } catch (err) {
      console.warn('Spawn Headless Error:', err);
      pendingRef.current = null;
      await runDemoFallback(prompt, attachments, agentMsgId, activeConversation.id, `gagal dijalankan (${String(err)})`);
    }
  };

  return { isGenerating, isPaused, handleStopGeneration, handleTogglePauseGeneration, handleSendMessage };
}
