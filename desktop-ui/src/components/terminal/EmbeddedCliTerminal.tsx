/**
 * EmbeddedCliTerminal.tsx
 * Panel Terminal CLI multi-tab: setiap tab menjalankan CLI agen native (agy/claude/codex/opencode)
 * di ConPTY, identik dengan CLI aslinya. Spesifikasi: specs/prd.md §2.10, specs/sdd-speckit.md §11.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Maximize2, Minimize2, RotateCw, Terminal as TerminalIcon, X } from 'lucide-react';
import type { AgentProvider } from '../../types/agent';
import type { CredentialRecord, ProjectRecord } from '../../types/database';
import { FALLBACK_AGENT_PROVIDERS } from '../../constants/agentProviders';
import { findTabByPath, type TerminalTab } from '../../hooks/useTerminalManager';
import {
  blobToBase64,
  readImageFromClipboard,
  readTextFromClipboard,
  saveBase64ImageToServer,
} from '../../utils/imagePasteHelper';
import { SingleTerminalView } from './SingleTerminalView';
import { QuickActionsMenu } from './QuickActionsMenu';
import { TerminalToolsMenu } from './TerminalToolsMenu';
import { TerminalTabBar } from './TerminalTabBar';
import { TerminalGuideBanner } from './TerminalGuideBanner';
import { AgentLauncherDropdown } from './AgentLauncherDropdown';
import { AgentSwitcher } from './AgentSwitcher';
import { getSlashConfig } from './slashConfig';
import { useTerminalZoom } from './useTerminalZoom';

interface EmbeddedCliTerminalProps {
  isLight: boolean;
  activeProject: ProjectRecord | null;
  selectedAgent: AgentProvider;
  agentProviders?: AgentProvider[];
  /** Tidak dipakai lagi: autentikasi default memakai login bawaan CLI (specs/agent-protocols.md §4). */
  credentials?: Record<string, CredentialRecord>;
  onClose?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  tabs?: TerminalTab[];
  activeTabId?: string;
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onOpenTab?: (agent: AgentProvider, projectPath: string) => void;
  onRestartTab?: (tabId: string) => void;
  /** Mengganti agen pada tab (direktori sama): PTY lama dimatikan, PTY agen baru dijalankan. */
  onSwitchAgent?: (tabId: string, agent: AgentProvider) => void;
  projects?: ProjectRecord[];
  onPickNewDirectory?: () => Promise<ProjectRecord | null | void> | void;
  onProjectActivity?: (projectPath: string) => void;
  /** false saat panel disembunyikan (mode Chat GUI); sesi PTY tetap hidup. */
  isVisible?: boolean;
  /** Melaporkan status proses CLI per sesi agar indikator tab ikut ter-render ulang. */
  onTabStatusChange?: (sessionId: string, isRunning: boolean, exitCode: number | null) => void;
}

const windowButtonClass = (isLight: boolean, danger = false) =>
  `p-1.5 rounded-lg border transition cursor-pointer shadow-2xs ${
    isLight
      ? `bg-white ${danger ? 'hover:bg-rose-100 hover:text-rose-600' : 'hover:bg-slate-200'} text-slate-600 border-slate-300`
      : `bg-slate-800 ${danger ? 'hover:bg-rose-950/60 hover:text-rose-400' : 'hover:bg-slate-700'} text-slate-300 border-slate-700`
  }`;

function newTab(agent: AgentProvider, projectPath: string, id = `tab-${agent.id}-${Date.now()}`): TerminalTab {
  return {
    id,
    sessionId: `pty-${agent.id}-${Date.now()}`,
    agent,
    projectPath,
    isRunning: true,
    exitCode: null,
    createdAt: Date.now(),
  };
}

export const EmbeddedCliTerminal: React.FC<EmbeddedCliTerminalProps> = ({
  isLight,
  activeProject,
  selectedAgent,
  agentProviders = FALLBACK_AGENT_PROVIDERS,
  onClose,
  isExpanded = false,
  onToggleExpand,
  tabs: externalTabs,
  activeTabId: externalActiveTabId,
  onSelectTab: externalSelectTab,
  onCloseTab: externalCloseTab,
  onOpenTab: externalOpenTab,
  onRestartTab: externalRestartTab,
  onSwitchAgent,
  projects = [],
  onPickNewDirectory,
  onProjectActivity,
  isVisible = true,
  onTabStatusChange,
}) => {
  const currentProjectPath = activeProject?.path || '';
  const [selectedDirectory, setSelectedDirectory] = useState<string>(currentProjectPath);
  useEffect(() => {
    if (activeProject?.path) setSelectedDirectory(activeProject.path);
  }, [activeProject?.path]);

  // State tab internal (fallback bila parent tidak mengelola tab)
  const [internalTabs, setInternalTabs] = useState<TerminalTab[]>(() => [
    newTab(selectedAgent, currentProjectPath, `tab-${selectedAgent.id}`),
  ]);
  const [internalActiveTabId, setInternalActiveTabId] = useState<string>(() => `tab-${selectedAgent.id}`);
  const tabs = externalTabs || internalTabs;
  const activeTabId = externalActiveTabId || internalActiveTabId;

  const [launcherAnchor, setLauncherAnchor] = useState<{ top: number; left: number } | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [pasteToast, setPasteToast] = useState<string | null>(null);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickActionsRef.current && !quickActionsRef.current.contains(e.target as Node)) setIsQuickActionsOpen(false);
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) setIsToolsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showToast = useCallback((msg: string) => {
    setPasteToast(msg);
    setTimeout(() => setPasteToast(null), 2800);
  }, []);

  const zoom = useTerminalZoom(showToast);

  // Registry fungsi per tab (diisi oleh SingleTerminalView)
  const sendInputMapRef = useRef<Record<string, (data: string) => Promise<void>>>({});
  const focusMapRef = useRef<Record<string, () => void>>({});
  const clearMapRef = useRef<Record<string, () => void>>({});
  const registerSendInput = useCallback((tabId: string, fn: (data: string) => Promise<void>) => {
    sendInputMapRef.current[tabId] = fn;
  }, []);
  const registerFocus = useCallback((tabId: string, fn: () => void) => {
    focusMapRef.current[tabId] = fn;
  }, []);
  const registerClear = useCallback((tabId: string, fn: () => void) => {
    clearMapRef.current[tabId] = fn;
  }, []);

  const focusActiveTerminal = useCallback(() => focusMapRef.current[activeTabId]?.(), [activeTabId]);
  const clearActiveTerminal = useCallback(() => {
    try {
      clearMapRef.current[activeTabId]?.();
    } catch {}
  }, [activeTabId]);

  const sendInputToActive = useCallback(
    (data: string) => {
      sendInputMapRef.current[activeTabId]?.(data);
      focusActiveTerminal();
      const currentTab = tabs.find((t) => t.id === activeTabId);
      if (!currentTab) return;
      if (currentTab.projectPath) onProjectActivity?.(currentTab.projectPath);
    },
    [activeTabId, focusActiveTerminal, tabs, onProjectActivity]
  );

  const activeTargetDir =
    tabs.find((t) => t.id === activeTabId)?.projectPath || selectedDirectory || currentProjectPath;

  const insertImage = useCallback(
    async (blob: Blob, filename: string) => {
      const base64 = await blobToBase64(blob);
      const res = await saveBase64ImageToServer(activeTargetDir, base64, filename);
      if (res.success && res.filePath) {
        sendInputToActive(`"${res.filePath}" `);
        showToast(`🖼️ Gambar (${res.filename}) disisipkan ke prompt!`);
        return true;
      }
      return false;
    },
    [activeTargetDir, sendInputToActive, showToast]
  );

  const handlePasteText = useCallback(async () => {
    const text = await readTextFromClipboard();
    if (text) {
      sendInputToActive(text);
      showToast('📋 Teks berhasil ditempel!');
    } else {
      showToast('⚠️ Clipboard teks kosong');
    }
  }, [sendInputToActive, showToast]);

  const handlePasteImageOrPick = useCallback(async () => {
    const clipboardImage = await readImageFromClipboard();
    if (clipboardImage) {
      try {
        if (await insertImage(clipboardImage.blob, clipboardImage.filename)) return;
      } catch (err) {
        console.error('Gagal memproses gambar clipboard:', err);
      }
    }
    fileInputRef.current?.click(); // tidak ada gambar di clipboard → pilih berkas
  }, [insertImage]);

  const handleFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await insertImage(file, file.name);
      } catch (err) {
        console.error('Gagal mengunggah gambar:', err);
      } finally {
        e.target.value = '';
      }
    },
    [insertImage]
  );

  const handleSelectTab = (tabId: string) => {
    if (externalSelectTab) externalSelectTab(tabId);
    else setInternalActiveTabId(tabId);
    setTimeout(focusActiveTerminal, 60);
  };

  const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (externalCloseTab) {
      externalCloseTab(tabId);
    } else {
      setInternalTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabId);
        if (remaining.length > 0 && activeTabId === tabId) setInternalActiveTabId(remaining[remaining.length - 1].id);
        return remaining;
      });
    }
    setTimeout(focusActiveTerminal, 60);
  };

  const handleOpenNewTab = (agent: AgentProvider, dir?: string) => {
    setLauncherAnchor(null);
    const chosenPath = dir || selectedDirectory || currentProjectPath;
    // 1 tab = 1 direktori: direktori yang sudah punya tab hanya difokuskan, tidak digandakan.
    const dirTab = findTabByPath(tabs, chosenPath);
    if (dirTab) {
      handleSelectTab(dirTab.id);
      const folder = chosenPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || chosenPath;
      showToast(`Direktori ini sudah aktif di Tab ${folder}`);
      return;
    }
    if (externalOpenTab) {
      externalOpenTab(agent, chosenPath);
    } else {
      const existing = internalTabs.find((t) => t.agent.id === agent.id && t.projectPath === chosenPath);
      if (existing) {
        setInternalActiveTabId(existing.id);
      } else {
        const tab = newTab(agent, chosenPath);
        setInternalTabs((prev) => [...prev, tab]);
        setInternalActiveTabId(tab.id);
      }
    }
    setTimeout(focusActiveTerminal, 80);
  };

  const handleRestartActiveTab = () => {
    if (externalRestartTab) {
      externalRestartTab(activeTabId);
    } else {
      setInternalTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? { ...t, sessionId: `pty-${t.agent.id}-${Date.now()}`, isRunning: true, exitCode: null }
            : t
        )
      );
    }
    setTimeout(focusActiveTerminal, 80);
  };

  const toggleLauncherAt = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (launcherAnchor) {
      setLauncherAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const dropdownWidth = 380;
    const left = rect.left + dropdownWidth > window.innerWidth - 12
      ? Math.max(12, window.innerWidth - dropdownWidth - 12)
      : rect.left;
    setLauncherAnchor({ top: rect.bottom + 6, left });
  };

  const currentActiveTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const activeAgentId = currentActiveTab?.agent.id || 'antigravity';

  return (
    <div
      className={`flex flex-col border transition-all duration-200 overflow-hidden ${
        isExpanded ? 'fixed inset-4 z-50 rounded-2xl shadow-2xl backdrop-blur-xl' : 'h-full w-full rounded-none border-t'
      } ${
        isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#090d16] border-slate-800/90 text-slate-200 shadow-2xl'
      }`}
    >
      {/* 1. Baris utama: identitas, menu aksi, dan kontrol jendela */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b select-none relative z-30 gap-2 min-w-0 w-full ${
          isLight ? 'bg-slate-100/95 border-slate-200' : 'bg-[#0b101c]/95 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border shadow-2xs ${
              isLight ? 'bg-blue-50/80 text-blue-800 border-blue-200' : 'bg-slate-800/80 text-cyan-400 border-cyan-500/30'
            }`}
          >
            <TerminalIcon className="w-3.5 h-3.5" />
            <span>Terminal Mesin CLI</span>
          </div>
          {pasteToast && (
            <div className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-in fade-in flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-400" />
              <span>{pasteToast}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 relative">
          <QuickActionsMenu
            isLight={isLight}
            isOpen={isQuickActionsOpen}
            isHelpOpen={isHelpOpen}
            menuRef={quickActionsRef}
            onToggle={() => {
              setIsQuickActionsOpen((prev) => !prev);
              setIsToolsMenuOpen(false);
            }}
            onClose={() => setIsQuickActionsOpen(false)}
            onSend={sendInputToActive}
            onToggleHelp={() => setIsHelpOpen((prev) => !prev)}
          />
          <TerminalToolsMenu
            isLight={isLight}
            isOpen={isToolsMenuOpen}
            menuRef={toolsMenuRef}
            slashConfig={getSlashConfig(activeAgentId)}
            activeAgentId={activeAgentId}
            zoomLevel={zoom.zoomLevel}
            minZoom={zoom.MIN_ZOOM}
            maxZoom={zoom.MAX_ZOOM}
            onToggle={() => {
              setIsToolsMenuOpen((prev) => !prev);
              setIsQuickActionsOpen(false);
            }}
            onClose={() => setIsToolsMenuOpen(false)}
            onSend={sendInputToActive}
            onClearScreen={clearActiveTerminal}
            onPasteText={handlePasteText}
            onPasteImage={handlePasteImageOrPick}
            onZoomIn={zoom.handleZoomIn}
            onZoomOut={zoom.handleZoomOut}
            onResetZoom={zoom.handleResetZoom}
          />
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFilePicked} className="hidden" />
          {onSwitchAgent && currentActiveTab && (
            <AgentSwitcher
              isLight={isLight}
              agents={agentProviders}
              activeAgentId={currentActiveTab.agent.id}
              onSwitch={(agent) => {
                onSwitchAgent(currentActiveTab.id, agent);
                showToast(`Agen diganti ke ${agent.name} di direktori yang sama`);
                setTimeout(focusActiveTerminal, 120);
              }}
            />
          )}
          <div className={`h-4 w-[1px] mx-1 ${isLight ? 'bg-slate-300' : 'bg-slate-800'}`} />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleRestartActiveTab}
            className={windowButtonClass(isLight)}
            title="Muat ulang / restart sesi mesin aktif"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
          {onToggleExpand && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={onToggleExpand}
              className={windowButtonClass(isLight)}
              title={isExpanded ? 'Kecilkan terminal' : 'Perbesar terminal penuh'}
            >
              {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
          {onClose && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClose}
              className={windowButtonClass(isLight, true)}
              title="Tutup terminal & kembali ke Chat GUI"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Baris tab sesi */}
      <TerminalTabBar
        isLight={isLight}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onOpenLauncher={toggleLauncherAt}
      />

      {/* 3. Panduan pemula */}
      {isHelpOpen && <TerminalGuideBanner isLight={isLight} onClose={() => setIsHelpOpen(false)} />}

      {/* 4. Kanvas terminal per tab */}
      <div className="flex-1 w-full h-full min-h-0 min-w-0 relative overflow-hidden" onClick={focusActiveTerminal}>
        {tabs.map((tab) => (
          <SingleTerminalView
            key={tab.id}
            isLight={isLight}
            tab={tab}
            isActive={isVisible && tab.id === activeTabId}
            zoomLevel={zoom.zoomLevel}
            onZoomIn={zoom.handleZoomIn}
            onZoomOut={zoom.handleZoomOut}
            onResetZoom={zoom.handleResetZoom}
            registerSendInput={registerSendInput}
            registerFocus={registerFocus}
            registerClear={registerClear}
            onStatusChange={(isRunning, exitCode) => {
              if (onTabStatusChange) {
                onTabStatusChange(tab.sessionId, isRunning, exitCode);
              } else {
                setInternalTabs((prev) =>
                  prev.map((t) => (t.sessionId === tab.sessionId ? { ...t, isRunning, exitCode } : t))
                );
              }
            }}
          />
        ))}
      </div>

      {/* 5. Pemilih mesin & direktori */}
      {launcherAnchor && (
        <AgentLauncherDropdown
          isLight={isLight}
          anchor={launcherAnchor}
          agentProviders={agentProviders}
          tabs={tabs}
          projects={projects}
          selectedDirectory={selectedDirectory}
          onSelectDirectory={setSelectedDirectory}
          onPickNewDirectory={onPickNewDirectory}
          onOpenAgent={handleOpenNewTab}
          onDismiss={() => {
            setLauncherAnchor(null);
            focusActiveTerminal();
          }}
        />
      )}
    </div>
  );
};
