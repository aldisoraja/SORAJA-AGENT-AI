import { FolderGit2, Folder, PanelLeft, MessageSquare, Terminal, ChevronRight } from 'lucide-react';
import type { ProjectRecord, ConversationRecord } from '../../types/database';
import type { AgentProvider } from '../../types/agent';
import type { TerminalTab } from '../../hooks/useTerminalManager';
import { getAgentIcon } from '../AgentIcons';

interface HeaderProps {
  isLight: boolean;
  isHighContrast: boolean;
  currentModalSidebar: string;
  activeProject: ProjectRecord | null;
  activeConversation: ConversationRecord | null;
  selectedAgent?: AgentProvider;
  activeTab?: TerminalTab | null;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  /** Lanjutkan sesi CLI percakapan aktif di tab Terminal (dipakai tombol terminal bila `cliSessionId` tersedia). */
  onOpenInTerminal?: () => void;
  activeViewMode?: 'chat' | 'terminal';
  onChangeViewMode?: (mode: 'chat' | 'terminal') => void;
}

export function Header({
  isLight,
  isHighContrast,
  currentModalSidebar,
  activeProject,
  activeConversation,
  selectedAgent,
  activeTab,
  isSidebarCollapsed = false,
  onToggleSidebar,
  onOpenInTerminal,
  activeViewMode = 'chat',
  onChangeViewMode,
}: HeaderProps) {
  // Satu tombol terminal: bila percakapan punya sesi CLI, sesi itu dilanjutkan; selain itu cukup pindah mode.
  const resumesCliSession = activeViewMode === 'chat' && !!activeConversation?.cliSessionId && !!onOpenInTerminal;
  const handleTerminalClick = () => {
    if (resumesCliSession) onOpenInTerminal?.();
    else onChangeViewMode?.('terminal');
  };

  return (
    <header
      className={`h-13 border-b px-3 sm:px-4 md:px-5 flex items-center justify-between gap-2.5 backdrop-blur-xl transition-colors duration-150 shrink-0 z-20 select-none ${
        isLight
          ? `bg-white/85 ${isHighContrast ? 'border-b-2 border-slate-300' : 'border-slate-200/90'} shadow-2xs`
          : `${isHighContrast ? 'border-b-2 border-slate-600' : 'border-slate-800/80'} bg-[#0a0f1d]/90`
      }`}
      style={isLight ? {} : { backgroundColor: `${currentModalSidebar}dd` }}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title="Toggle Sidebar (Ctrl+B)"
            className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center shrink-0 md:hidden ${
              isSidebarCollapsed
                ? isLight
                  ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-2xs'
                  : 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60'
                : isLight
                ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-600'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 text-slate-400'
            }`}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        {activeProject ? (
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto scrollbar-none py-0.5">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border shrink-0 shadow-2xs ${
                isLight ? 'bg-white border-slate-200/90 text-slate-800' : 'bg-slate-900/90 border-slate-800 text-slate-100'
              }`}
            >
              <FolderGit2 className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
              <span className="truncate max-w-[130px] sm:max-w-[200px] md:max-w-[260px] font-bold">{activeProject.name}</span>
              {activeProject.branch && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-medium hidden sm:inline-block ${
                    isLight
                      ? 'text-blue-700 bg-blue-50 border border-blue-200/60'
                      : 'text-cyan-400/90 bg-cyan-950/60 border border-cyan-800/50'
                  }`}
                >
                  {activeProject.branch}
                </span>
              )}
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600 shrink-0" />

            {/* Konteks aktif: Mesin Terminal CLI atau Percakapan GUI */}
            {activeViewMode === 'terminal' ? (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border font-medium shrink-0 shadow-2xs ${
                  isLight ? 'bg-blue-50/80 border-blue-200 text-blue-900' : 'bg-cyan-950/50 border-cyan-700/60 text-cyan-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${activeTab?.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}
                  title={activeTab?.isRunning ? 'Sesi mesin CLI aktif' : 'Sesi berhenti'}
                />
                <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                  {selectedAgent ? getAgentIcon(selectedAgent.id, 'w-3.5 h-3.5') : <Terminal className="w-3.5 h-3.5" />}
                </div>
                <span className="font-semibold truncate">{selectedAgent?.name || 'Mesin CLI'} Terminal</span>
                {selectedAgent?.executable && (
                  <span
                    className={`text-[9px] font-mono px-1 py-0.2 rounded border hidden sm:inline-block ${
                      isLight ? 'bg-white border-blue-200 text-blue-700' : 'bg-slate-900 border-cyan-800/80 text-cyan-400'
                    }`}
                  >
                    {selectedAgent.executable}
                  </span>
                )}
              </div>
            ) : (
              activeConversation && (
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border font-medium shrink-0 shadow-2xs ${
                    isLight ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900/90 border-slate-800 text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate max-w-[120px] sm:max-w-[200px] md:max-w-xs font-semibold">{activeConversation.title}</span>
                </div>
              )
            )}
          </div>
        ) : (
          <div className={`flex items-center gap-2 text-xs truncate ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            <Folder className={`w-4 h-4 shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-600'}`} />
            <span className="truncate">Pilih atau buka proyek di panel kiri</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onChangeViewMode && (
          <div
            className={`flex items-center p-0.5 rounded-xl border ${
              isLight ? 'bg-slate-100/90 border-slate-200' : 'bg-slate-900/90 border-slate-800'
            }`}
          >
            <button
              onClick={() => onChangeViewMode('chat')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeViewMode === 'chat'
                  ? isLight
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                    : 'bg-slate-800 text-cyan-300 shadow-xs border border-slate-700'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Mode Obrolan & Tanya Jawab AI (Visual Antigravity)"
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Chat GUI</span>
            </button>
            <button
              onClick={handleTerminalClick}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeViewMode === 'terminal'
                  ? isLight
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                    : 'bg-cyan-950/80 text-cyan-300 shadow-xs border border-cyan-800/60'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={
                resumesCliSession
                  ? `Buka terminal & lanjutkan sesi CLI ${activeConversation?.cliSessionId}`
                  : 'Mode Mesin Koding Otonom (CLI Terminal Multi-Agent)'
              }
            >
              <Terminal className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden lg:inline">Mesin CLI Terminal</span>
              <span className="hidden sm:inline lg:hidden">Mesin CLI</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
