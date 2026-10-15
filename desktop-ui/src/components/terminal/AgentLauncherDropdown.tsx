import React, { useState } from 'react';
import { Folder, FolderPlus, Terminal as TerminalIcon } from 'lucide-react';
import type { AgentProvider } from '../../types/agent';
import type { ProjectRecord } from '../../types/database';
import { findTabByPath, type TerminalTab } from '../../hooks/useTerminalManager';
import { getAgentIcon } from '../AgentIcons';

const AGENT_BADGE: Record<string, string> = {
  antigravity: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  claude: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  opencode: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  codex: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  kiro: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
};

interface AgentLauncherDropdownProps {
  isLight: boolean;
  anchor: { top: number; left: number };
  agentProviders: AgentProvider[];
  tabs: TerminalTab[];
  projects: ProjectRecord[];
  selectedDirectory: string;
  onSelectDirectory: (path: string) => void;
  onPickNewDirectory?: () => Promise<ProjectRecord | null | void> | void;
  onOpenAgent: (agent: AgentProvider, dir: string) => void;
  onDismiss: () => void;
}

/** Menu "Pilih Mesin & Direktori" (posisi fixed agar tidak terpotong overflow). */
export const AgentLauncherDropdown: React.FC<AgentLauncherDropdownProps> = ({
  isLight,
  anchor,
  agentProviders,
  tabs,
  projects,
  selectedDirectory,
  onSelectDirectory,
  onPickNewDirectory,
  onOpenAgent,
  onDismiss,
}) => {
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  // 1 tab = 1 direktori: bila direktori terpilih sudah punya tab, memilih agen hanya memfokuskan tab itu.
  const dirTab = findTabByPath(tabs, selectedDirectory);

  return (
    <>
      <div className="fixed inset-0 z-[998] bg-black/20 backdrop-blur-[0.5px]" onClick={onDismiss} />
      <div
        style={{ position: 'fixed', top: `${anchor.top}px`, left: `${anchor.left}px` }}
        className={`w-80 sm:w-96 rounded-2xl shadow-2xl border p-2 z-[999] backdrop-blur-xl animate-in fade-in zoom-in-95 max-h-[82vh] overflow-y-auto ${
          isLight
            ? 'bg-white/98 border-slate-200 text-slate-800 shadow-slate-400/40'
            : 'bg-[#101626]/98 border-slate-700 text-slate-200 shadow-black/90'
        }`}
      >
        <div className="px-3 py-2 border-b border-slate-200/60 dark:border-slate-800/80 mb-2">
          <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-cyan-400 uppercase">
            <div className="flex items-center gap-1.5">
              <TerminalIcon className="w-3.5 h-3.5" />
              <span>PILIH MESIN & DIREKTORI</span>
            </div>
            <span className="text-[9px] font-mono text-slate-400">Multi-Repo</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Pilih asisten AI yang ingin dibuka di sesi terminal:</p>

          <div className="mt-2 p-2 rounded-xl bg-slate-900/60 border border-slate-700/60">
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300">
                <Folder className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Direktori Kerja:</span>
              </div>
              {projects.length > 1 && (
                <button
                  onClick={() => setIsFolderPickerOpen((prev) => !prev)}
                  className="text-[10px] text-cyan-400 hover:underline cursor-pointer lowercase"
                >
                  {isFolderPickerOpen ? 'tutup opsi' : 'ganti repo ▼'}
                </button>
              )}
            </div>
            <div
              className="font-mono text-[10px] text-slate-200 truncate bg-black/40 px-2 py-1 rounded border border-slate-800"
              title={selectedDirectory}
            >
              {selectedDirectory}
            </div>

            {isFolderPickerOpen && projects.length > 0 && (
              <div className="mt-2 space-y-1 max-h-36 overflow-y-auto border-t border-slate-700/60 pt-1.5">
                <div className="text-[9px] text-slate-400 uppercase font-semibold">Pilih Ruang Kerja Lain:</div>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectDirectory(p.path);
                      setIsFolderPickerOpen(false);
                    }}
                    className={`w-full text-left p-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition ${
                      selectedDirectory === p.path
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-[9px] font-mono text-slate-400 truncate max-w-[120px]">{p.path}</span>
                  </button>
                ))}
              </div>
            )}

            {onPickNewDirectory && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const picked = await onPickNewDirectory();
                  if (picked && picked.path) {
                    onSelectDirectory(picked.path);
                    setIsFolderPickerOpen(false);
                  }
                }}
                className="mt-1.5 w-full text-left p-1.5 rounded-lg text-[11px] flex items-center gap-1.5 text-cyan-400 hover:bg-cyan-950/40 font-medium cursor-pointer border border-cyan-800/40 transition"
              >
                <FolderPlus className="w-3 h-3 text-cyan-400" />
                <span>+ Buka Folder / Repo Komputer Lain...</span>
              </button>
            )}
          </div>
        </div>

        {dirTab && (
          <div className="mx-1 mt-1 px-2.5 py-1.5 rounded-lg text-[10px] leading-relaxed bg-amber-500/10 text-amber-300 border border-amber-500/30">
            Direktori ini sudah aktif di tab <b>{dirTab.agent.name}</b>. Tab tidak akan digandakan; untuk berganti mesin AI gunakan
            tombol <b>Ganti Agen</b> di toolbar terminal.
          </div>
        )}

        <div className="space-y-1 mt-1.5">
          {agentProviders.map((agent) => {
            const isTabOpen = dirTab?.agent.id === agent.id;
            const notInstalled = agent.isInstalled === false;
            return (
              <button
                key={agent.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onOpenAgent(agent, selectedDirectory)}
                className={`w-full flex items-start justify-between p-2.5 rounded-xl text-left transition cursor-pointer border ${
                  isTabOpen
                    ? isLight
                      ? 'soraja-grad-soft border-blue-200 hover:bg-blue-100/80'
                      : 'bg-cyan-950/40 border-cyan-700/50 hover:bg-cyan-900/50'
                    : isLight
                    ? 'bg-slate-50 border-transparent hover:bg-slate-100 hover:border-slate-200'
                    : 'bg-slate-900/60 border-transparent hover:bg-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-2.5 truncate">
                  <div className="w-7 h-7 rounded-lg bg-slate-800/80 flex items-center justify-center shrink-0 border border-slate-700/60 mt-0.5">
                    {getAgentIcon(agent.id, 'w-4 h-4')}
                  </div>
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs truncate">{agent.name}</span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-semibold ${
                          AGENT_BADGE[agent.id] ?? AGENT_BADGE.codex
                        }`}
                      >
                        {agent.executable || agent.id} · {agent.vendor}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                      {notInstalled ? 'CLI belum terpasang di komputer ini' : agent.description || agent.vendor}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      isTabOpen
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-700/60 text-slate-300 border border-slate-600/50'
                    }`}
                  >
                    {isTabOpen ? 'Tab Aktif' : dirTab ? 'Direktori terpakai' : 'Buka ➔'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
