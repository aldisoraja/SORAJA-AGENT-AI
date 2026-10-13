import React from 'react';
import { Plus, Terminal as TerminalIcon, X } from 'lucide-react';
import type { TerminalTab } from '../../hooks/useTerminalManager';
import { getAgentIcon } from '../AgentIcons';

interface TerminalTabBarProps {
  isLight: boolean;
  tabs: TerminalTab[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string, e: React.MouseEvent) => void;
  onOpenLauncher: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function folderNameOf(path: string): string {
  return path ? path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path : '';
}

export const TerminalTabBar: React.FC<TerminalTabBarProps> = ({
  isLight,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onOpenLauncher,
}) => (
  <div
    className={`flex items-center justify-between px-3 py-1.5 border-b select-none min-w-0 w-full overflow-x-auto scrollbar-none z-20 ${
      isLight ? 'bg-slate-200/60 border-slate-300/80' : 'bg-[#090d16]/95 border-slate-800/90'
    }`}
  >
    <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto scrollbar-none py-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 shrink-0 mr-1">
        <TerminalIcon className="w-3 h-3 text-cyan-400" />
        Sesi Tab:
      </span>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const folderName = folderNameOf(tab.projectPath);
        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`group flex items-center gap-2 px-3 py-1 rounded-lg text-xs cursor-pointer transition border shrink-0 ${
              isActive
                ? isLight
                  ? 'bg-white text-blue-900 border-blue-400/80 shadow-sm font-semibold'
                  : 'bg-slate-800/95 text-cyan-300 border-cyan-500/50 shadow-md font-semibold ring-1 ring-cyan-500/20'
                : isLight
                ? 'bg-slate-100/80 hover:bg-white text-slate-600 border-slate-300/70 hover:border-slate-400'
                : 'bg-slate-900/60 hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
            }`}
            title={`Sesi: ${tab.agent.name} (${tab.projectPath})`}
          >
            <span className="shrink-0">{getAgentIcon(tab.agent.id, 'w-3.5 h-3.5')}</span>
            <span className="truncate max-w-[130px]">{tab.agent.name}</span>
            {folderName && (
              <span
                className={`text-[10px] font-mono px-1 py-0.2 rounded ${
                  isActive
                    ? isLight
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-cyan-950/70 text-cyan-300/80'
                    : isLight
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-black/30 text-slate-500'
                } truncate max-w-[90px]`}
              >
                {folderName}
              </span>
            )}
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${tab.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}
              title={tab.isRunning ? 'Sesi sedang berjalan' : 'Sesi berhenti'}
            />
            {tabs.length > 1 && (
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => onCloseTab(tab.id, e)}
                className="p-0.5 rounded hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 opacity-60 group-hover:opacity-100 transition cursor-pointer ml-0.5"
                title="Tutup tab sesi ini"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}

      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onOpenLauncher}
        className={`px-2.5 py-1 rounded-lg text-xs font-medium border border-dashed transition cursor-pointer flex items-center gap-1 shrink-0 ${
          isLight
            ? 'border-slate-300 text-slate-600 hover:bg-white hover:text-blue-600 hover:border-blue-300'
            : 'border-slate-700/80 text-slate-400 hover:bg-slate-800/80 hover:text-cyan-300 hover:border-cyan-600/50'
        }`}
        title="Buka direktori baru di tab baru (1 tab = 1 direktori)"
      >
        <Plus className="w-3 h-3 stroke-[2.5]" />
        <span>Tab Baru</span>
      </button>
    </div>

    <div className="flex items-center gap-2 shrink-0 ml-3">
      <span
        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
          isLight ? 'bg-slate-100 border-slate-300 text-slate-600' : 'bg-slate-900/90 border-slate-800 text-slate-400'
        }`}
      >
        {tabs.length} sesi aktif
      </span>
    </div>
  </div>
);
