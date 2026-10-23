/**
 * useTerminalRouting.ts
 * Sinkronisasi dua arah antara tab Terminal CLI dan state workspace (agen, proyek, percakapan),
 * serta routing pemilihan percakapan ke Chat GUI atau Terminal.
 */
import { useEffect, useRef } from 'react';
import { sorajaDb, type ConversationRecord, type ProjectRecord } from '../services/db';
import type { AgentProvider } from '../types/agent';
import { cliTitleFromInput, isCliConversation, isCliPlaceholderTitle, isPlaceholderTitle, uniqueConversationTitle } from '../utils/conversationTitle';
import { findTabByPath, type TerminalTab, type useTerminalManager } from './useTerminalManager';
import type { WorkspaceState } from './useWorkspaceState';

type TerminalManager = ReturnType<typeof useTerminalManager>;

export function useTerminalRouting(
  ws: WorkspaceState,
  terminalManager: TerminalManager,
  setActiveViewMode: (mode: 'chat' | 'terminal') => void,
  activeViewMode: 'chat' | 'terminal'
) {
  // Sesi PTY yang judul percakapannya sudah diurus (pelabelan cukup sekali per sesi CLI).
  const labeledSessions = useRef(new Set<string>());

  // Sinkronisasi dua arah agen ↔ tab terminal HANYA saat mode Terminal aktif, agar pilihan agen
  // di Chat GUI tidak tertimpa tab terminal (dan tidak memicu spawn CLI di latar belakang).
  // 1. Tab Mesin CLI aktif → agen terpilih & proyek aktif. Proyek ikut disinkronkan agar efek (2)
  //    tidak menarik fokus kembali ke tab proyek lama (bug: ganti agen di tab 1 → loncat ke tab 2).
  useEffect(() => {
    if (activeViewMode !== 'terminal') return;
    const activeTab = terminalManager.tabs.find((t) => t.id === terminalManager.activeTabId);
    if (!activeTab) return;
    if (activeTab.agent.id !== ws.selectedAgent.id) {
      ws.selectAgentById(activeTab.agent.id);
    }
    const norm = (p?: string) => (p || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
    if (norm(ws.activeProject?.path) !== norm(activeTab.projectPath)) {
      const proj = ws.projects.find((p) => norm(p.path) === norm(activeTab.projectPath));
      if (proj) ws.setActiveProject(proj);
    }
  }, [terminalManager.activeTabId, terminalManager.tabs, activeViewMode]);

  // 2. Proyek aktif → tab Mesin CLI. Sengaja TIDAK bergantung pada agen terpilih: pergantian agen
  //    (dari tab aktif) tidak boleh memindahkan fokus tab.
  useEffect(() => {
    if (activeViewMode === 'terminal' && ws.activeProject) {
      terminalManager.syncActiveProject(ws.selectedAgent, ws.activeProject.path);
    }
  }, [ws.activeProject?.id, activeViewMode]);

  // Catatan: tab terminal TIDAK otomatis dicatat sebagai percakapan di sidebar Chat GUI.

  // Prompt pertama pengguna di sesi terminal CLI: beri label "CLI · <prompt>" pada percakapan milik tab itu.
  // Dicatat per sesi PTY (ganti agen / tab baru = sesi CLI baru). Perintah slash (/usage, /model) bukan prompt.
  // Hanya menyentuh percakapan tab itu sendiri: sesi CLI lain proyek+agen yang sama (sudah berjudul) tidak
  // boleh "menelan" sesi baru, karena dulu itu membuat judul sesi baru tidak pernah berubah.
  const handleCliFirstInput = async (tab: TerminalTab, line: string) => {
    if (line.startsWith('/') || labeledSessions.current.has(tab.sessionId)) return;
    const norm = (p?: string) => (p || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
    const proj = ws.projects.find((p) => norm(p.path) === norm(tab.projectPath));
    if (!proj) return;
    labeledSessions.current.add(tab.sessionId);

    const all = await sorajaDb.getConversations();
    const own = all.find((c) => c.id === tab.conversationId && isCliConversation(c));
    if (own && !isCliPlaceholderTitle(own.title)) return; // sesi CLI yang di-resume mempertahankan judulnya

    // Draf "Percakapan baru (N)" kosong yang sedang aktif lalu dipakai mengetik di terminal:
    // draf itu menjadi sesi CLI berlabel prompt pertama (draf dihapus agar tidak tersisa label salah).
    const draft = ws.activeConversation;
    const draftId =
      !own &&
      draft &&
      draft.projectId === proj.id &&
      !isCliConversation(draft) &&
      isPlaceholderTitle(draft.title) &&
      (await sorajaDb.getMessages(draft.id)).length === 0
        ? draft.id
        : null;

    const otherTitles = all
      .filter((c) => c.projectId === proj.id && c.id !== own?.id && c.id !== draftId)
      .map((c) => c.title);
    const title = uniqueConversationTitle(cliTitleFromInput(line), otherTitles);

    if (own) {
      ws.setConversations(await sorajaDb.updateConversationTitle(own.id, title));
    } else {
      const now = new Date().toISOString();
      const newConv: ConversationRecord = {
        id: tab.conversationId?.startsWith('conv-cli-') ? tab.conversationId : `conv-cli-${tab.agent.id}-${Date.now()}`,
        projectId: proj.id,
        title,
        agentId: tab.agent.id,
        modelId: tab.agent.models[0]?.id || 'default',
        status: 'active',
        timeAgo: 'Baru saja',
        createdAt: now,
        updatedAt: now,
      };
      if (draftId) await sorajaDb.deleteConversation(draftId);
      ws.setConversations(await sorajaDb.createConversation(newConv));
      if (draftId) ws.setActiveConversation(newConv);
    }
    ws.touchProjectActivity(proj.id);
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
      // Sesi CLI baru (tanpa resume) hanya memakai ulang placeholder "Sesi <agen> CLI" yang belum berjudul;
      // sesi lama yang sudah berjudul tidak dipakai agar prompt pertama sesi ini menjadi judulnya sendiri.
      // TIDAK menjadi percakapan aktif Chat GUI (chat & CLI terpisah).
      const existingConv = ws.conversations.find(
        (c) =>
          c.projectId === targetProj.id && c.agentId === agent.id && isCliConversation(c) && isCliPlaceholderTitle(c.title)
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
      // 1 tab = 1 direktori. Sesi CLI milik agen tertentu, jadi tab direktori ini harus memakai agen
      // percakapan yang diklik; bila berbeda, agen tab diganti agar terminal cocok dengan percakapan & sidebar.
      const agent = ws.agentProviders.find((a) => a.id === conv.agentId) || ws.selectedAgent;
      const matchingTab = findTabByPath(terminalManager.tabs, proj.path);
      if (matchingTab && matchingTab.agent.id === agent.id) {
        terminalManager.setActiveTabId(matchingTab.id);
      } else {
        terminalManager.openTab(agent, proj.path, conv.id, true);
      }
      setActiveViewMode('terminal');
    } else {
      setActiveViewMode('chat');
    }
  };

  return { handleCliFirstInput, handleOpenTerminalTab, handleSelectConversationWithRouting };
}
