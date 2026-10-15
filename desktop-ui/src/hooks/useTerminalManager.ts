import { useState, useCallback, useRef, useEffect } from 'react';
import type { AgentProvider } from '../types/agent';
import { AGENT_PROVIDERS } from '../constants/agentProviders';
import { loadSessionState, saveSessionState } from '../utils/sessionState';
import { hasSpawned, ptyClose } from '../components/terminal/ptyTransport';

export interface TerminalTab {
  id: string;
  sessionId: string;
  conversationId?: string;
  /** Id sesi milik CLI yang di-resume saat tab dibuka (mis. dari tombol "Buka di Terminal"). */
  cliSessionId?: string;
  agent: AgentProvider;
  projectPath: string;
  isRunning: boolean;
  exitCode: number | null;
  createdAt: number;
}

export function normalizePath(p?: string | null): string {
  if (!p) return '';
  return p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** Tab inisial bawaan hook: id persis `tab-<agentId>` (tab buatan pengguna selalu memakai akhiran timestamp). */
function isInitialTab(tab: TerminalTab): boolean {
  // Hanya tab awal yang BELUM pernah menjalankan CLI yang boleh digantikan; sesi berjalan tidak dimatikan diam-diam.
  return tab.id === `tab-${tab.agent.id}` && !hasSpawned(tab.sessionId);
}

/**
 * Aturan ketat: 1 tab = 1 direktori kerja unik. Identitas tab adalah path ternormalisasi,
 * bukan kombinasi agen + path, sehingga tidak pernah ada dua proses CLI di folder yang sama.
 */
export function findTabByPath(tabs: TerminalTab[], projectPath?: string | null): TerminalTab | undefined {
  const clean = normalizePath(projectPath);
  return clean ? tabs.find((t) => normalizePath(t.projectPath) === clean) : undefined;
}

function createTab(agent: AgentProvider, projectPath: string, convId?: string, cliSessionId?: string): TerminalTab {
  const now = Date.now();
  return {
    id: `tab-${agent.id}-${now}`,
    sessionId: `pty-${agent.id}-${now}`,
    conversationId: convId || `conv-cli-${agent.id}-${now}`,
    cliSessionId,
    agent,
    projectPath,
    isRunning: true,
    exitCode: null,
    createdAt: now,
  };
}

/** Tab yang sama, agen berbeda: sesi PTY baru, id sesi CLI lama (milik agen sebelumnya) dibuang. */
function withAgent(tab: TerminalTab, agent: AgentProvider, convId?: string, cliSessionId?: string): TerminalTab {
  const now = Date.now();
  return {
    ...tab,
    agent,
    sessionId: `pty-${agent.id}-${now}`,
    conversationId: convId || `conv-cli-${agent.id}-${now}`,
    cliSessionId,
    isRunning: true,
    exitCode: null,
  };
}

type SavedTab = Omit<TerminalTab, 'agent'> & { agentId: string };

/** Memulihkan tab dari sessionStorage (agen dirakit ulang dari katalog karena ikon React tidak serializable). */
function restoreTabs(): { tabs: TerminalTab[]; activeId: string } | null {
  const saved = loadSessionState<{ tabs: SavedTab[]; activeId: string } | null>('terminalTabs', null);
  if (!saved || !Array.isArray(saved.tabs) || saved.tabs.length === 0) return null;
  const tabs: TerminalTab[] = [];
  for (const { agentId, ...rest } of saved.tabs) {
    const agent = AGENT_PROVIDERS.find((p) => p.id === agentId);
    if (agent) tabs.push({ ...rest, agent });
  }
  if (tabs.length === 0) return null;
  const activeId = tabs.some((t) => t.id === saved.activeId) ? saved.activeId : tabs[0].id;
  return { tabs, activeId };
}

export function useTerminalManager(defaultAgent: AgentProvider, defaultProjectPath: string) {
  const [restored] = useState(restoreTabs);
  const [tabs, setTabs] = useState<TerminalTab[]>(() => restored?.tabs ?? [
    {
      id: `tab-${defaultAgent.id}`,
      sessionId: `pty-${defaultAgent.id}-${Date.now()}`,
      conversationId: `conv-cli-${defaultAgent.id}-initial`,
      agent: defaultAgent,
      projectPath: defaultProjectPath,
      isRunning: true,
      exitCode: null,
      createdAt: Date.now(),
    },
  ]);

  const [activeTabId, setActiveTabId] = useState<string>(() => restored?.activeId ?? `tab-${defaultAgent.id}`);

  useEffect(() => {
    const serial: SavedTab[] = tabs.map(({ agent, ...rest }) => ({ ...rest, agentId: agent.id }));
    saveSessionState('terminalTabs', { tabs: serial, activeId: activeTabId });
  }, [tabs, activeTabId]);

  // Ref tracking open tabs (untuk efek samping di luar updater & pengecekan duplikasi oleh UI)
  const tabsRef = useRef<TerminalTab[]>(tabs);
  tabsRef.current = tabs;

  /** Menerapkan perubahan tab dan langsung memperbarui ref, agar panggilan beruntun dalam satu tick tidak memakai data usang. */
  const commit = useCallback((update: (prev: TerminalTab[]) => TerminalTab[]) => {
    const next = update(tabsRef.current);
    tabsRef.current = next;
    setTabs(next);
  }, []);

  /** Mematikan PTY (dan seluruh proses anaknya) milik sesi tab. */
  const killSession = (tab?: TerminalTab) => {
    if (tab) ptyClose(tab.sessionId);
  };

  /** Tab yang sedang memakai direktori ini (null bila belum ada). */
  const findTabByDirectory = useCallback(
    (projectPath?: string | null) => findTabByPath(tabsRef.current, projectPath) ?? null,
    []
  );

  /**
   * Membuka agen pada direktori. Direktori yang sudah punya tab TIDAK membuat tab baru:
   * tab itu difokuskan, dan agennya diganti di tempat bila `switchAgent` (default true) dan agennya berbeda.
   */
  const openTab = useCallback(
    (agent: AgentProvider, projectPath: string, customConvId?: string, switchAgent = true) => {
      const current = tabsRef.current;
      const existing = findTabByPath(current, projectPath);

      if (existing) {
        setActiveTabId(existing.id);
        if (existing.agent.id === agent.id || !switchAgent) return;
        killSession(existing);
        commit((prev) => prev.map((t) => (t.id === existing.id ? withAgent(t, agent, customConvId) : t)));
        return;
      }

      const newTab = createTab(agent, projectPath, customConvId);
      setActiveTabId(newTab.id);
      // Tab inisial bawaan (belum dipilih pengguna) digantikan, bukan ditambah di sampingnya
      if (current.length === 1 && isInitialTab(current[0])) {
        killSession(current[0]);
        commit(() => [newTab]);
      } else {
        commit((prev) => [...prev, newTab]);
      }
    },
    []
  );

  /** Membuka tab yang me-resume sesi CLI dari Chat GUI (tombol "Buka di Terminal"). */
  const openResumeTab = useCallback((agent: AgentProvider, projectPath: string, cliSessionId: string, convId?: string) => {
    const current = tabsRef.current;
    const sameSession = current.find((t) => t.cliSessionId === cliSessionId);
    if (sameSession) {
      setActiveTabId(sameSession.id);
      return;
    }
    const existing = findTabByPath(current, projectPath);
    if (existing) {
      setActiveTabId(existing.id);
      // Sesi terminal yang masih hidup dipertahankan (hanya difokuskan); tab yang sudah berhenti memuat sesi yang di-resume.
      if (existing.isRunning) return;
      killSession(existing);
      commit((prev) => prev.map((t) => (t.id === existing.id ? withAgent(t, agent, convId, cliSessionId) : t)));
      return;
    }
    const tab = createTab(agent, projectPath, convId, cliSessionId);
    setActiveTabId(tab.id);
    if (current.length === 1 && isInitialTab(current[0])) {
      killSession(current[0]);
      commit(() => [tab]);
    } else {
      commit((prev) => [...prev, tab]);
    }
  }, []);

  /** Mengganti mesin AI pada tab yang sama (direktori sama): PTY lama dimatikan, PTY agen baru dijalankan. */
  const switchAgent = useCallback((tabId: string, agent: AgentProvider) => {
    const target = tabsRef.current.find((t) => t.id === tabId);
    if (!target || target.agent.id === agent.id) return;
    killSession(target);
    commit((prev) => prev.map((t) => (t.id === tabId ? withAgent(t, agent) : t)));
  }, []);

  /**
   * Sinkronisasi pasif tab aktif ke proyek aktif: tab direktori itu difokuskan bila ada
   * (agen tidak diganti diam-diam); bila belum ada, tab dibuat.
   */
  const syncActiveProject = useCallback((agent: AgentProvider, projectPath: string, customConvId?: string) => {
    if (!projectPath) return;
    const existing = findTabByPath(tabsRef.current, projectPath);
    if (existing) {
      setActiveTabId((cur) => (cur === existing.id ? cur : existing.id));
      return;
    }
    openTab(agent, projectPath, customConvId, false);
  }, [openTab]);

  // Update initial project path when activeProject loads from DB
  const updateInitialProjectPath = useCallback((projectPath: string) => {
    if (!projectPath) return;
    const cleanTarget = normalizePath(projectPath);
    commit((prev) => {
      if (prev.length === 1 && normalizePath(prev[0].projectPath) !== cleanTarget) {
        return [{ ...prev[0], projectPath }];
      }
      return prev;
    });
  }, []);

  // Close a specific tab and terminate its PTY
  const closeTab = useCallback((tabId: string) => {
    const current = tabsRef.current;
    killSession(current.find((t) => t.id === tabId));
    const remaining = current.filter((t) => t.id !== tabId);
    commit(() => remaining);
    // Bila tab aktif ditutup, pindah ke tab terakhir yang tersisa
    setActiveTabId((cur) => (cur === tabId && remaining.length > 0 ? remaining[remaining.length - 1].id : cur));
  }, []);

  // Restart an active tab's PTY session
  const restartTab = useCallback((tabId: string) => {
    killSession(tabsRef.current.find((t) => t.id === tabId));
    commit((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? { ...tab, sessionId: `pty-${tab.agent.id}-${Date.now()}`, isRunning: true, exitCode: null }
          : tab
      )
    );
  }, []);

  // Update tab status from PTY events
  const setTabStatus = useCallback((sessionId: string, isRunning: boolean, exitCode: number | null) => {
    commit((prev) =>
      prev.map((tab) => {
        if (tab.sessionId === sessionId) {
          return { ...tab, isRunning, exitCode };
        }
        return tab;
      })
    );
  }, []);

  return {
    tabs,
    activeTabId,
    setActiveTabId,
    openTab,
    openResumeTab,
    switchAgent,
    findTabByDirectory,
    syncActiveProject,
    updateInitialProjectPath,
    closeTab,
    restartTab,
    setTabStatus,
  };
}
