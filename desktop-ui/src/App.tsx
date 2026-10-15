import { useState, useEffect } from 'react';
import { Database } from 'lucide-react';

import { useWorkspaceState } from './hooks/useWorkspaceState';

import { Sidebar } from './components/sidebar/Sidebar';
import { Header } from './components/header/Header';
import { ChatFeed } from './components/chat/ChatFeed';
import { ChatInputBar } from './components/chat/ChatInputBar';
import { DiffReviewPanel } from './components/diff/DiffReviewPanel';
import { AppModals } from './components/AppModals';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useBlockBrowserShortcuts } from './hooks/useBlockBrowserShortcuts';
import { EmbeddedCliTerminal } from './components/terminal/EmbeddedCliTerminal';
import { useTerminalManager } from './hooks/useTerminalManager';
import { useTerminalRouting } from './hooks/useTerminalRouting';
import { useAutoApplyToast } from './hooks/useAutoApplyToast';
import { loadSessionState, saveSessionState } from './utils/sessionState';
import { isCliConversation } from './utils/conversationTitle';
import type { ProjectRecord } from './types/database';
import type { AgentProvider } from './types/agent';

export default function App() {
  const ws = useWorkspaceState();
  useBlockBrowserShortcuts();
  useAutoApplyToast(ws.messages, ws.showDbToast);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeViewMode, setActiveViewMode] = useState<'chat' | 'terminal'>(() =>
    loadSessionState<'chat' | 'terminal'>('viewMode', 'chat')
  );
  useEffect(() => saveSessionState('viewMode', activeViewMode), [activeViewMode]);
  const [hasOpenedTerminal, setHasOpenedTerminal] = useState(activeViewMode === 'terminal');
  if (activeViewMode === 'terminal' && !hasOpenedTerminal) setHasOpenedTerminal(true);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);

  const terminalManager = useTerminalManager(
    ws.selectedAgent,
    ws.activeProject?.path || ''
  );

  // Global Ctrl+B shortcut for Toggle Sidebar (Antigravity style)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-collapse sidebar pada layar sempit (< 768px atau laptop kompak) agar UI responsif
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { handleOpenTerminalTab, handleSelectConversationWithRouting } = useTerminalRouting(
    ws,
    terminalManager,
    setActiveViewMode,
    activeViewMode
  );

  // Navigasi otomatis setelah Wizard Workspace selesai (Chat GUI atau Mesin CLI Terminal)
  const handleNavigateAfterCreate = (project: ProjectRecord, agent: AgentProvider, mode: 'chat' | 'terminal') => {
    setActiveViewMode(mode);
    // Terminal: buka tab + sesi "Sesi <agen> CLI". Chat: draf kosong, sesi dibuat saat input pertama.
    if (mode === 'terminal') {
      void handleOpenTerminalTab(agent, project.path, project);
    }
  };
  ws.navigateAfterCreateRef.current = handleNavigateAfterCreate;

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden font-sans select-none antialiased transition-colors duration-150 ${
        ws.isLight ? 'bg-slate-100 text-slate-900' : 'text-slate-100'
      }`}
      style={{
        backgroundColor: ws.currentBg,
        color: ws.currentFg,
      }}
    >
      {/* Toast Notification */}
      {ws.toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-[60] text-xs px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 border ${
            ws.isLight
              ? 'bg-white/95 border-blue-200 text-blue-900 shadow-blue-500/15'
              : 'bg-slate-900/90 border-cyan-500/40 text-cyan-300'
          }`}
        >
          <Database className={`w-4 h-4 animate-pulse ${ws.isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
          <span className="font-medium">{ws.toastMessage}</span>
        </div>
      )}

      {/* 1. Sidebar */}
      <Sidebar
        isLight={ws.isLight}
        isHighContrast={ws.isHighContrast}
        currentModalSidebar={ws.currentModalSidebar}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        dbHealth={ws.dbHealth}
        conversations={ws.conversations}
        scheduledTasks={ws.scheduledTasks}
        projects={ws.projects}
        activeProject={ws.activeProject}
        activeConversation={ws.activeConversation}
        isLoadingDb={ws.isLoadingDb}
        collapsedProjects={ws.collapsedProjects}
        projectFilterQuery={ws.projectFilterQuery}
        filterTab={ws.filterTab}
        selectedAgent={ws.selectedAgent}
        selectedModel={ws.selectedModel}
        credentials={ws.credentials}
        installedCliAgents={ws.installedCliAgents}
        onOpenSettings={() => ws.setIsSettingsOpen(true)}
        onOpenHistory={() => ws.setIsHistoryModalOpen(true)}
        onOpenTasks={() => ws.setIsTasksModalOpen(true)}
        onCreateNewConversation={ws.handleCreateNewConversation}
        onOpenNewProjectWizard={() => {
          ws.refreshInstalledCliAgents();
          ws.setWizardStep(1);
          ws.setPickedFolderName('');
          ws.setPickedFolderPath('');
          ws.setIsNewProjectModalOpen(true);
        }}
        onSetProjectFilterQuery={ws.setProjectFilterQuery}
        onSetFilterTab={ws.setFilterTab}
        onSelectProject={(proj) => {
          ws.handleSelectProject(proj);
          terminalManager.syncActiveProject(ws.selectedAgent, proj.path);
        }}
        onSelectConversation={handleSelectConversationWithRouting}
        onToggleProjectCollapsed={ws.toggleProjectCollapsed}
        onTogglePinProject={ws.handleTogglePinProject}
        onDeleteProject={ws.handleDeleteProject}
        onCreateConversationForProject={(proj, e) => {
          ws.handleCreateConversationForProject(proj, e);
          terminalManager.syncActiveProject(ws.selectedAgent, proj.path);
          setActiveViewMode('chat');
        }}
        onOpenConnectModal={(agent) => ws.setConnectModalProvider(agent)}
        onOpenChangeAgentWizard={() => {
          ws.refreshInstalledCliAgents();
          ws.setWizardStep(2);
          ws.setIsNewProjectModalOpen(true);
        }}
        agentProviders={ws.agentProviders}
        terminalTabs={terminalManager.tabs}
        activeTabId={terminalManager.activeTabId}
        onSelectTerminalTab={(tabId) => {
          terminalManager.setActiveTabId(tabId);
          setActiveViewMode('terminal');
        }}
        onSelectAgentTerminal={(proj, agent) => {
          handleOpenTerminalTab(agent, proj.path);
        }}
      />

      {/* Mobile / Small Screen Sidebar Backdrop Overlay */}
      {!isSidebarCollapsed && (
        <div
          onClick={() => setIsSidebarCollapsed(true)}
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-xs transition-opacity cursor-pointer"
        />
      )}

      {/* 2. Main Canvas & Chat Area */}
      <main
        className={`flex-1 flex flex-col h-full min-w-0 overflow-hidden transition-colors duration-150 relative ${
          ws.isLight ? 'text-slate-900' : 'text-slate-100'
        }`}
        style={
          ws.isLight
            ? {
                backgroundImage: `
                  radial-gradient(ellipse 90% 60% at 50% -10%, rgba(219, 234, 254, 0.6) 0%, transparent 60%),
                  radial-gradient(ellipse 70% 50% at 100% 50%, rgba(238, 242, 255, 0.7) 0%, transparent 50%),
                  linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)
                `,
              }
            : { backgroundColor: ws.currentBg }
        }
      >
        <Header
          isLight={ws.isLight}
          isHighContrast={ws.isHighContrast}
          currentModalSidebar={ws.currentModalSidebar}
          activeProject={ws.activeProject}
          activeConversation={ws.activeConversation}
          selectedAgent={ws.selectedAgent}
          activeTab={terminalManager.tabs.find((t) => t.id === terminalManager.activeTabId)}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
          activeViewMode={activeViewMode}
          onChangeViewMode={(mode) => {
            setActiveViewMode(mode);
            // Sesi CLI tidak boleh tampil sebagai percakapan Chat GUI: kembali ke sesi chat proyek (atau draf)
            if (mode === 'chat' && ws.activeProject && isCliConversation(ws.activeConversation)) {
              ws.handleSelectProject(ws.activeProject, { force: true });
            }
            if (mode === 'terminal' && ws.activeProject) {
              terminalManager.syncActiveProject(ws.selectedAgent, ws.activeProject.path);
            }
          }}
          onOpenInTerminal={() => {
            const conv = ws.activeConversation;
            if (!conv?.cliSessionId || !ws.activeProject) return;
            const agent = ws.agentProviders.find((a) => a.id === conv.agentId) || ws.selectedAgent;
            terminalManager.openResumeTab(agent, ws.activeProject.path, conv.cliSessionId, conv.id);
            setActiveViewMode('terminal');
          }}
        />

        <div className="flex-1 flex min-w-0 overflow-hidden relative">
          {/* Terminal tetap ter-mount setelah pertama dibuka agar sesi CLI tidak mati saat pindah ke Chat GUI */}
          {hasOpenedTerminal && (
            <ErrorBoundary name="Terminal CLI">
            <div className={activeViewMode === 'terminal' ? 'flex-1 h-full w-full p-4 min-w-0' : 'hidden'}>
              <EmbeddedCliTerminal
                isVisible={activeViewMode === 'terminal'}
                onTabStatusChange={terminalManager.setTabStatus}
                isLight={ws.isLight}
                activeProject={ws.activeProject}
                selectedAgent={ws.selectedAgent}
                agentProviders={ws.agentProviders}
                credentials={ws.credentials}
                isExpanded={isTerminalExpanded}
                onToggleExpand={() => setIsTerminalExpanded((prev) => !prev)}
                onClose={() => setActiveViewMode('chat')}
                tabs={terminalManager.tabs}
                activeTabId={terminalManager.activeTabId}
                onSelectTab={terminalManager.setActiveTabId}
                onCloseTab={terminalManager.closeTab}
                onOpenTab={handleOpenTerminalTab}
                onRestartTab={terminalManager.restartTab}
                onSwitchAgent={terminalManager.switchAgent}
                projects={ws.projects}
                onPickNewDirectory={ws.handlePickFolderOnly}
                onProjectActivity={(path) => ws.touchProjectActivityByPath(path)}
              />
            </div>
            </ErrorBoundary>
          )}
          {activeViewMode !== 'terminal' && (
            <ErrorBoundary name="Chat GUI">
            <div
              className={`flex flex-col h-full overflow-hidden transition-all duration-200 ${
                ws.activeDiffReview?.isOpen
                  ? ws.isLight
                    ? 'w-1/2 border-r border-slate-200'
                    : 'w-1/2 border-r border-slate-800/80'
                  : 'flex-1'
              }`}
            >
              <ChatFeed
                isLight={ws.isLight}
                isGenerating={ws.isGenerating}
                messages={ws.messages}
                activeProject={ws.activeProject}
                selectedAgent={ws.selectedAgent}
                settings={ws.settings}
                expandedReasoning={ws.expandedReasoning}
                onToggleReasoning={(id) =>
                  ws.setExpandedReasoning((prev) => ({
                    ...prev,
                    [id]: prev[id] !== undefined ? !prev[id] : !(ws.settings?.verboseAgentChat ?? false),
                  }))
                }
                onOpenNewProjectWizard={() => {
                  ws.setWizardStep(1);
                  ws.setPickedFolderName('');
                  ws.setPickedFolderPath('');
                  ws.setIsNewProjectModalOpen(true);
                }}
                onOpenDiffReview={(files, idx = 0) => {
                  const lastUserMsg = [...ws.messages].reverse().find((m) => m.sender === 'user');
                  ws.setActiveDiffReview({
                    isOpen: true,
                    files,
                    activeFileIndex: idx,
                    turnPrompt: lastUserMsg?.content || 'Perubahan kode otonom',
                  });
                }}
              />

              <ChatInputBar
                isLight={ws.isLight}
                isHighContrast={ws.isHighContrast}
                currentModalSidebar={ws.currentModalSidebar}
                activeProject={ws.activeProject}
                activeConversation={ws.activeConversation}
                selectedAgent={ws.selectedAgent}
                selectedModel={ws.selectedModel}
                agentProviders={ws.agentProviders}
                installedCliAgents={ws.installedCliAgents}
                onSelectAgent={(agent) => {
                  ws.handleSelectAgent(agent);
                  const isCliAvailable = ws.installedCliAgents[agent.id]?.is_installed;
                  const isCredConnected = ws.credentials[agent.id]?.isConnected;
                  if (!isCliAvailable && !isCredConnected) {
                    ws.setConnectModalProvider(agent);
                  }
                }}
                isGenerating={ws.isGenerating}
                isPaused={ws.isPaused}
                onStop={ws.handleStopGeneration}
                onTogglePause={ws.handleTogglePauseGeneration}
                onSelectModel={(m) => {
                  ws.setSelectedModel(m);
                  const isCliAvailable = ws.installedCliAgents[ws.selectedAgent.id]?.is_installed;
                  const isCredConnected = ws.credentials[ws.selectedAgent.id]?.isConnected;
                  if (!isCliAvailable && !isCredConnected) {
                    ws.setConnectModalProvider(ws.selectedAgent);
                  }
                }}
                onSendMessage={ws.handleSendMessage}
                onOpenUsageModal={() => ws.setIsSettingsOpen(true)}
                onUploadMedia={() => {}}
                workspaceFiles={ws.workspaceFiles}
              />
            </div>
            </ErrorBoundary>
          )}

          {/* Docked Split-Pane Diff Review Panel */}
          {ws.activeDiffReview?.isOpen && (
            <DiffReviewPanel
              isLight={ws.isLight}
              activeDiffReview={ws.activeDiffReview}
              onClose={() => ws.setActiveDiffReview(null)}
              onSelectFile={(idx) =>
                ws.setActiveDiffReview((prev) => (prev ? { ...prev, activeFileIndex: idx } : null))
              }
            />
          )}
        </div>
      </main>

      {/* 3-10. Modal aplikasi */}
      <ErrorBoundary name="Modal" fallback={null}>
        <AppModals
          ws={ws}
          onOpenAgentTerminal={(agent) => handleOpenTerminalTab(agent, ws.activeProject?.path || '')}
        />
      </ErrorBoundary>
    </div>
  );
}
