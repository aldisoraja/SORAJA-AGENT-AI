/**
 * useTerminalRouting.ts
 * Sinkronisasi dua arah antara tab Terminal CLI dan state workspace (agen, proyek, percakapan),
 * serta routing pemilihan percakapan ke Chat GUI atau Terminal.
 */
import { useEffect } from 'react';
import { sorajaDb, type ConversationRecord, type ProjectRecord } from '../services/db';
import type { AgentProvider } from '../types/agent';
import { isCliConversation } from '../utils/conversationTitle';
import { findTabByPath, type TerminalTab, type useTerminalManager } from './useTerminalManager';
import type { WorkspaceState } from './useWorkspaceState';

type TerminalManager = ReturnType<typeof useTerminalManager>;

export function useTerminalRouting(
  ws: WorkspaceState,
  terminalManager: TerminalManager,
  setActiveViewMode: (mode: 'chat' | 'terminal') => void,
  activeViewMode: 'chat' | 'terminal'
) {
  // Sinkronisasi dua arah agen ↔ tab terminal HANYA saat mode Terminal aktif, agar pilihan agen
  // di Chat GUI tidak tertimpa tab terminal (dan tidak memicu spawn CLI di latar belakang).
  // 1. Tab Mesin CLI aktif → agen terpilih
  useEffect(() => {
    if (activeViewMode !== 'terminal') return;
    const activeTab = terminalManager.tabs.find((t) => t.id === terminalManager.activeTabId);
    if (activeTab && activeTab.agent.id !== ws.selectedAgent.id) {
      ws.selectAgentById(activeTab.agent.id);
    }
  }, [terminalManager.activeTabId, terminalManager.tabs, activeViewMode]);

  // 2. Agen terpilih & proyek aktif → tab Mesin CLI
  useEffect(() => {
    if (activeViewMode === 'terminal' && ws.activeProject) {
      terminalManager.syncActiveProject(ws.selectedAgent, ws.activeProject.path);
    }
  }, [ws.selectedAgent.id, ws.activeProject?.id, activeViewMode]);

  // Catatan: tab terminal TIDAK otomatis dicatat sebagai percakapan di sidebar Chat GUI.

  // Handler pembaruan judul percakapan dari inputan pertama pengguna di terminal CLI
  const handleUpdateTabTitle = async (tab: TerminalTab, title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    // Normalisasi fungsi pembantu path direktori
    const norm = (p?: string) => (p || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');

    // 1. Tarik daftar percakapan terbaru langsung dari database SQLite / localStorage
    const allConvs = await sorajaDb.getConversations();

    const isDefaultTitle = (t?: string) => {
      if (!t) return true;
      const lower = t.trim().toLowerCase();
      return (
        t.startsWith('Percakapan Baru') ||
        lower.startsWith('percakapan baru') ||
        lower.startsWith('sesi ') ||
        lower.startsWith('percakapan ') ||
        lower.includes('cli')
      );
    };

    let targetConv: ConversationRecord | undefined = undefined;

    // Prioritas 1: Jika percakapan aktif pengguna (activeConversation) saat ini judulnya MASIH DEFAULT
    if (ws.activeConversation && isDefaultTitle(ws.activeConversation.title)) {
      targetConv = allConvs.find((c) => c.id === ws.activeConversation?.id);
    }

    // Prioritas 2: Cari berdasarkan tab.conversationId jika ada dan judulnya masih default
    if (!targetConv && tab.conversationId) {
      const matchByTabConv = allConvs.find((c) => c.id === tab.conversationId);
      if (matchByTabConv && isDefaultTitle(matchByTabConv.title)) {
        targetConv = matchByTabConv;
      }
    }

    // Prioritas 3: Cari proyek terkait (utamakan ws.activeProject atau cocokkan tab.projectPath)
    let targetProj = ws.activeProject;
    if (!targetProj || (tab.projectPath && norm(targetProj.path) !== norm(tab.projectPath))) {
      const matchedProj = ws.projects.find((p) => norm(p.path) === norm(tab.projectPath));
      if (matchedProj) {
        targetProj = matchedProj;
      }
    }

    // Jika targetConv belum ditemukan, cari percakapan ber-judul default di proyek tersebut
    if (!targetConv && targetProj) {
      const projConvs = allConvs.filter((c) => c.projectId === targetProj.id);
      targetConv = projConvs.find((c) => isDefaultTitle(c.title));
    }

    // Jika targetConv ditemukan (dan judulnya masih default):
    if (targetConv) {
      const updatedConvs = await sorajaDb.updateConversationTitle(targetConv.id, cleanTitle);
      ws.setConversations(updatedConvs);
      ws.setActiveConversation({ ...targetConv, title: cleanTitle });
      if (targetProj) {
        ws.touchProjectActivity(targetProj.id);
      }
      ws.showDbToast(`Judul percakapan diperbarui: "${cleanTitle}"`);
      return;
    }

    // Tidak ada percakapan yang cocok: JANGAN membuat entri baru di sidebar Chat GUI.
    // Ketikan di terminal CLI hanya boleh memengaruhi judul tab terminal lokal.
  };

  // Handler membuka tab terminal sekaligus mencatat percakapan di database proyek
  const handleOpenTerminalTab = async (agent: AgentProvider, projectPath: string, projectOverride?: ProjectRecord) => {
    const norm = (p?: string) => (p || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
    // projectOverride: proyek yang baru dibuat belum ada di `ws.projects` (closure lama)
    const targetProj = projectOverride ?? ws.projects.find((p) => norm(p.path) === norm(projectPath));

    let convId = `conv-cli-${agent.id}-${Date.now()}`;
    if (targetProj) {
      ws.setActiveProject(targetProj);
      ws.touchProjectActivity(targetProj.id);
      // Sesi CLI dipakai ulang per proyek+agen; TIDAK menjadi percakapan aktif Chat GUI (chat & CLI terpisah)
      const existingConv = ws.conversations.find(
        (c) => c.projectId === targetProj.id && c.agentId === agent.id && isCliConversation(c)
      );
      if (existingConv) {
        convId = existingConv.id;
      } else {
        const newConv: ConversationRecord = {
          id: convId,
          projectId: targetProj.id,
          title: `Sesi ${agent.name} CLI`,
          agentId: agent.id,
          modelId: agent.models[0]?.id || 'default',
          status: 'active',
          timeAgo: 'Baru saja',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const updated = await sorajaDb.createConversation(newConv);
        ws.setConversations(updated);
      }
    }

    terminalManager.openTab(agent, projectPath, convId);
    setActiveViewMode('terminal');
  };

  // Handler pemilihan percakapan: Arahkan ke terminal jika sesi CLI, atau Chat GUI jika percakapan biasa
  const handleSelectConversationWithRouting = async (proj: ProjectRecord, conv: ConversationRecord) => {
    await ws.handleSelectConversation(proj, conv);
    ws.touchProjectActivity(proj.id);
    if (isCliConversation(conv)) {
      // 1 tab = 1 direktori: cukup fokus ke tab direktori ini (agennya tidak diganti diam-diam)
      const matchingTab = findTabByPath(terminalManager.tabs, proj.path);
      if (matchingTab) {
        terminalManager.setActiveTabId(matchingTab.id);
      } else {
        const agent = ws.agentProviders.find((a) => a.id === conv.agentId) || ws.selectedAgent;
        terminalManager.openTab(agent, proj.path, undefined, false);
      }
      setActiveViewMode('terminal');
    } else {
      setActiveViewMode('chat');
    }
  };

  return { handleUpdateTabTitle, handleOpenTerminalTab, handleSelectConversationWithRouting };
}
