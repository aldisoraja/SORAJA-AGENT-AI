import { useState, useEffect, useRef, type MouseEvent } from 'react';
import { FolderPlus, Search, X, Settings, RefreshCw } from 'lucide-react';
import type { ProjectRecord, ConversationRecord, CredentialRecord } from '../../types/database';
import type { AgentProvider, ModelItem } from '../../types/agent';
import type { CliAgentStatus } from '../../services/cliAdapters';
import type { TerminalTab } from '../../hooks/useTerminalManager';
import { FALLBACK_AGENT_PROVIDERS } from '../../constants/agentProviders';
import { SidebarHeader } from './SidebarHeader';
import { SidebarCollapsedRail } from './SidebarCollapsedRail';
import { SidebarProjectItem } from './SidebarProjectItem';
import { SidebarAgentPill } from './SidebarAgentPill';

export { groupConversationsByDate, type ConversationGroup } from './conversationGrouping';

export interface SidebarProps {
  isLight: boolean;
  isHighContrast: boolean;
  currentModalSidebar: string;
  isCollapsed?: boolean;
  dbHealth: { mode: string; sizeKb: string } | null;
  conversations: ConversationRecord[];
  projects: ProjectRecord[];
  activeProject: ProjectRecord | null;
  activeConversation: ConversationRecord | null;
  isLoadingDb: boolean;
  collapsedProjects: Record<string, boolean>;
  projectFilterQuery: string;
  filterTab: 'all' | 'pinned' | 'active';
  selectedAgent: AgentProvider;
  selectedModel: ModelItem;
  credentials: Record<string, CredentialRecord>;
  installedCliAgents?: Record<string, CliAgentStatus>;
  onToggleCollapse?: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onOpenFavorites: () => void;
  onCreateNewConversation: () => void;
  onOpenNewProjectWizard: () => void;
  onSetProjectFilterQuery: (query: string) => void;
  onSetFilterTab: (tab: 'all' | 'pinned' | 'active') => void;
  onSelectProject: (proj: ProjectRecord) => void;
  onSelectConversation: (proj: ProjectRecord, conv: ConversationRecord) => void;
  onToggleProjectCollapsed: (projectId: string) => void;
  onTogglePinProject: (projectId: string, e: MouseEvent) => void;
  onDeleteProject: (projectId: string, e: MouseEvent) => void;
  onToggleFavoriteConversation: (convId: string, e?: MouseEvent) => void;
  onCreateConversationForProject: (proj: ProjectRecord, e: MouseEvent) => void;
  onOpenConnectModal: (agent: AgentProvider) => void;
  onOpenChangeAgentWizard: () => void;
  agentProviders?: AgentProvider[];
  onSelectAgentTerminal?: (proj: ProjectRecord, agent: AgentProvider) => void;
  terminalTabs?: TerminalTab[];
  activeTabId?: string;
  onSelectTerminalTab?: (tabId: string) => void;
}

export function Sidebar({
  isLight,
  isHighContrast,
  currentModalSidebar,
  isCollapsed = false,
  dbHealth,
  conversations,
  projects,
  activeProject,
  activeConversation,
  isLoadingDb,
  collapsedProjects,
  projectFilterQuery,
  filterTab,
  selectedAgent,
  selectedModel,
  credentials,
  installedCliAgents = {},
  onToggleCollapse,
  onOpenSettings,
  onOpenHistory,
  onOpenFavorites,
  onCreateNewConversation,
  onOpenNewProjectWizard,
  onSetProjectFilterQuery,
  onSetFilterTab,
  onSelectProject,
  onSelectConversation,
  onToggleProjectCollapsed,
  onTogglePinProject,
  onDeleteProject,
  onToggleFavoriteConversation,
  onCreateConversationForProject,
  onOpenConnectModal,
  onOpenChangeAgentWizard,
  agentProviders: _agentProviders = FALLBACK_AGENT_PROVIDERS,
  onSelectAgentTerminal: _onSelectAgentTerminal,
  terminalTabs = [],
  activeTabId: _activeTabId,
  onSelectTerminalTab: _onSelectTerminalTab,
}: SidebarProps) {
  // State for project search input visibility
  const [showSearch, setShowSearch] = useState(false);
  // State for expanding/collapsing beyond top 3 chats per repo
  const [expandedRepoChats, setExpandedRepoChats] = useState<Record<string, boolean>>({});


  const filteredProjects = projects
    .filter((p) => {
      if (filterTab === 'pinned' && !p.isPinned) return false;
      if (filterTab === 'active') {
        const hasTabs = terminalTabs?.some(
          (t) => t.projectPath.toLowerCase().replace(/\\/g, '/') === p.path.toLowerCase().replace(/\\/g, '/')
        );
        if (!hasTabs && activeProject?.id !== p.id) return false;
      }
      if (!projectFilterQuery) return true;

      const matchName = p.name.toLowerCase().includes(projectFilterQuery.toLowerCase());
      const matchPath = p.path.toLowerCase().includes(projectFilterQuery.toLowerCase());
      const matchConv = conversations.some(
        (c) => c.projectId === p.id && c.title.toLowerCase().includes(projectFilterQuery.toLowerCase())
      );
      return matchName || matchPath || matchConv;
    })
    .sort((a, b) => {
      const pinA = a.isPinned ? 1 : 0;
      const pinB = b.isPinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
      return timeB - timeA;
    });

  // Dynamic resizable sidebar width state (persisted in localStorage)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('soraja_sidebar_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 200 && parsed <= 600) return parsed;
      }
    } catch {}
    return 290;
  });

  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(sidebarWidth);
  widthRef.current = sidebarWidth;

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const resetWidth = () => {
    setSidebarWidth(290);
    try {
      localStorage.setItem('soraja_sidebar_width', '290');
    } catch {}
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const maxAllowed = typeof window !== 'undefined' ? Math.min(600, Math.floor(window.innerWidth * 0.7)) : 600;
      const newWidth = Math.min(maxAllowed, Math.max(200, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem('soraja_sidebar_width', widthRef.current.toString());
      } catch {}
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Mode rail (sidebar diciutkan). Harus SETELAH semua hook (Rules of Hooks).
  if (isCollapsed) {
    return (
      <SidebarCollapsedRail
        isLight={isLight}
        isHighContrast={isHighContrast}
        currentModalSidebar={currentModalSidebar}
        activeProject={activeProject}
        selectedAgent={selectedAgent}
        onToggleSidebar={onToggleCollapse || (() => {})}
        onCreateNewConversation={onCreateNewConversation}
        onOpenHistory={onOpenHistory}
        onOpenFavorites={onOpenFavorites}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  return (
    <aside
      className={`shrink-0 border-r flex flex-col justify-between shadow-xl fixed md:relative inset-y-0 left-0 z-40 md:z-20 max-w-[85vw] ${
        isResizing ? '' : 'transition-[width] duration-150'
      } ${
        isLight
          ? `bg-gradient-to-b from-white via-slate-50/90 to-indigo-50/40 ${
              isHighContrast ? 'border-r-2 border-slate-300' : 'border-slate-200'
            } text-slate-800`
          : `${isHighContrast ? 'border-r-2 border-slate-600' : 'border-slate-800/60'} text-slate-100`
      }`}
      style={{
        width: `${sidebarWidth}px`,
        ...(!isLight ? { backgroundColor: currentModalSidebar } : {}),
      }}
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* A. Antigravity Sidebar Header (Menu Strip, Toggle [|] Ctrl+B, History, New Chat) */}
        <SidebarHeader
          isLight={isLight}
          dbHealth={dbHealth}
          conversationsCount={conversations.length}
          favoritesCount={conversations.filter((c) => c.isFavorite).length}
          onToggleSidebar={onToggleCollapse || (() => {})}
          onOpenSettings={onOpenSettings}
          onOpenHistory={onOpenHistory}
          onOpenFavorites={onOpenFavorites}
          onCreateNewConversation={onCreateNewConversation}
        />

        {/* B. Projects Header (DeSaIn Style) */}
        <div className="px-3 pt-3 pb-1 space-y-1.5">
          <div className="flex items-center justify-between text-xs px-1">
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-bold tracking-tight ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                Proyek
              </span>
              <button
                onClick={onOpenNewProjectWizard}
                title="Tambah proyek (pilih folder kode di komputer Anda)"
                className={`p-1 rounded-md transition cursor-pointer ${
                  isLight ? 'text-slate-400 hover:text-blue-600 hover:bg-slate-100' : 'text-slate-500 hover:text-cyan-300 hover:bg-slate-800'
                }`}
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowSearch((prev) => !prev)}
                title="Cari proyek atau percakapan"
                className={`p-1 rounded-md transition cursor-pointer ${
                  showSearch || projectFilterQuery
                    ? 'text-cyan-400'
                    : isLight
                    ? 'text-slate-400 hover:text-slate-600'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* DeSaIn Pill Switch: Aktif vs Semua space */}
            <div className={`flex rounded-lg p-0.5 border ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <button
                onClick={() => onSetFilterTab('active')}
                title="Hanya proyek yang sedang dibuka"
                className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-md transition cursor-pointer ${
                  filterTab === 'active'
                    ? isLight
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'bg-slate-800 text-cyan-300 shadow-xs'
                    : isLight
                    ? 'text-slate-500 hover:text-slate-800'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Dibuka
              </button>
              <button
                onClick={() => onSetFilterTab('all')}
                title="Tampilkan semua proyek"
                className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-md transition cursor-pointer ${
                  filterTab === 'all'
                    ? isLight
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'bg-slate-800 text-cyan-300 shadow-xs'
                    : isLight
                    ? 'text-slate-500 hover:text-slate-800'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Semua
              </button>
            </div>
          </div>

          {/* Search Input when toggled or query exists */}
          {(showSearch || projectFilterQuery) && (
            <div className="relative pt-0.5">
              <Search className={`w-3 h-3 absolute left-2.5 top-2.5 pointer-events-none ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
              <input
                type="text"
                value={projectFilterQuery}
                onChange={(e) => onSetProjectFilterQuery(e.target.value)}
                placeholder="Cari proyek atau percakapan..."
                className={`w-full rounded-lg pl-7 pr-6 py-1 text-xs border focus:outline-none ${
                  isLight
                    ? 'bg-white border-slate-200 text-slate-800'
                    : 'bg-slate-900 border-slate-800 text-slate-200'
                }`}
                autoFocus
              />
              <button
                onClick={() => {
                  onSetProjectFilterQuery('');
                  setShowSearch(false);
                }}
                className="absolute right-1.5 top-1.5 p-1 text-slate-400 hover:text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* C. Dynamic Projects Tree */}
        <div className="flex-1 overflow-y-auto px-2 space-y-2 py-1 scrollbar-thin">
          {isLoadingDb ? (
            <div className="p-4 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
              <span>Memuat proyek...</span>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className={`p-4 rounded-xl text-center text-xs border border-dashed m-1 ${
              isLight ? 'border-slate-300 text-slate-500' : 'border-slate-800 text-slate-500'
            }`}>
              <p>Tidak ada proyek yang cocok.</p>
              <button
                onClick={onOpenNewProjectWizard}
                className="mt-2 text-blue-600 dark:text-cyan-400 font-semibold hover:underline cursor-pointer block mx-auto text-[11px]"
              >
                + Tambah Proyek
              </button>
            </div>
          ) : (
            filteredProjects.map((proj) => {
              const isSelectedProject = activeProject?.id === proj.id;
              const isCollapsed = collapsedProjects[proj.id] ?? false;
              const projConvs = conversations.filter((c) => c.projectId === proj.id);
              return (
                <SidebarProjectItem
                  key={proj.id}
                  isLight={isLight}
                  proj={proj}
                  projConvs={projConvs}
                  isSelectedProject={isSelectedProject}
                  isCollapsed={isCollapsed}
                  expandedRepoChats={expandedRepoChats}
                  setExpandedRepoChats={setExpandedRepoChats}
                  activeConversation={activeConversation}
                  onCreateConversationForProject={onCreateConversationForProject}
                  onDeleteProject={onDeleteProject}
                  onToggleFavoriteConversation={onToggleFavoriteConversation}
                  onSelectConversation={onSelectConversation}
                  onSelectProject={onSelectProject}
                  onTogglePinProject={onTogglePinProject}
                  onToggleProjectCollapsed={onToggleProjectCollapsed}
                />
              );
            })
          )}
        </div>

        <SidebarAgentPill
          isLight={isLight}
          credentials={credentials}
          installedCliAgents={installedCliAgents}
          onOpenChangeAgentWizard={onOpenChangeAgentWizard}
          onOpenConnectModal={onOpenConnectModal}
          selectedAgent={selectedAgent}
          selectedModel={selectedModel}
        />

        {/* E. Footer */}
        <div className={`p-2 border-t flex items-center justify-between px-3 ${
          isLight ? 'border-slate-200/90 bg-slate-50/80' : 'border-slate-800/80 bg-[#090c14]'
        }`}>
          <button
            onClick={onOpenSettings}
            className={`flex items-center gap-2 py-1 transition text-xs font-medium cursor-pointer ${
              isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Settings className={`w-4 h-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
            <span>Pengaturan</span>
          </button>
        </div>
      </div>

      {/* Resizable Drag Handle (Tepi Kanan Sidebar) */}
      <div
        onMouseDown={startResizing}
        onDoubleClick={resetWidth}
        title="Geser tepi ini untuk melebarkan/mengecilkan sidebar (Klik 2x untuk reset ke 290px)"
        className={`absolute top-0 right-0 w-2 h-full cursor-col-resize z-40 select-none group transition-colors flex items-center justify-center ${
          isResizing ? 'bg-sky-500/30' : 'hover:bg-sky-500/20 active:bg-sky-500/40'
        }`}
      >
        <div
          className={`w-0.5 h-14 rounded-full transition-all ${
            isResizing ? 'bg-sky-500 scale-y-125' : 'bg-transparent group-hover:bg-sky-400/80'
          }`}
        />
      </div>
    </aside>
  );
}
