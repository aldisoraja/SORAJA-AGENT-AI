import React from 'react';
import { ArrowRight, Info, Terminal as TerminalIcon } from 'lucide-react';
import type { AgentProvider } from '../../types/agent';
import type { ProjectRecord } from '../../types/database';
import { findTabByPath, type TerminalTab } from '../../hooks/useTerminalManager';
import { getAgentIcon } from '../AgentIcons';
import { WorkspacePicker } from './WorkspacePicker';

const AGENT_BADGE: Record<string, { dark: string; light: string }> = {
  antigravity: { dark: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30', light: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  claude: { dark: 'bg-amber-500/10 text-amber-300 border-amber-500/30', light: 'bg-amber-50 text-amber-700 border-amber-200' },
  opencode: { dark: 'bg-purple-500/10 text-purple-300 border-purple-500/30', light: 'bg-purple-50 text-purple-700 border-purple-200' },
  codex: { dark: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', light: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  kiro: { dark: 'bg-violet-500/10 text-violet-300 border-violet-500/30', light: 'bg-violet-50 text-violet-700 border-violet-200' },
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
  // 1 tab = 1 direktori: bila direktori terpilih sudah punya tab, memilih agen hanya memfokuskan tab itu.
  const dirTab = findTabByPath(tabs, selectedDirectory);

  return (
    <>
      <div className="fixed inset-0 z-[998] bg-black/20 backdrop-blur-[0.5px]" onClick={onDismiss} />
      <div
        style={{ position: 'fixed', top: `${anchor.top}px`, left: `${anchor.left}px` }}
        className={`w-80 sm:w-96 rounded-2xl shadow-2xl border z-[999] backdrop-blur-xl animate-in fade-in zoom-in-95 max-h-[82vh] overflow-y-auto ${
          isLight
            ? 'bg-white/98 border-slate-200 text-slate-800 shadow-slate-400/40'
            : 'bg-[#0e1422]/98 border-slate-700/80 text-slate-200 shadow-black/90'
        }`}
      >
        {/* Header */}
        <div className={`px-4 pt-4 pb-3.5 border-b ${isLight ? 'border-slate-100' : 'border-slate-800/80'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  isLight ? 'soraja-grad-primary text-white' : 'bg-gradient-to-br from-cyan-500/25 to-blue-600/20 border border-cyan-500/30 text-cyan-300'
                }`}
              >
                <TerminalIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className={`text-[13px] font-semibold leading-tight ${isLight ? 'text-slate-900' : 'text-slate-50'}`}>
                  Pilih Mesin & Direktori
                </h3>
                <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Asisten AI untuk sesi terminal baru
                </p>
              </div>
            </div>
            <span
              className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md border shrink-0 ${
                isLight ? 'text-slate-500 border-slate-200 bg-slate-50' : 'text-slate-400 border-slate-700 bg-slate-800/50'
              }`}
            >
              Multi-Repo
            </span>
          </div>

          <WorkspacePicker
            isLight={isLight}
            projects={projects}
            selectedDirectory={selectedDirectory}
            onSelectDirectory={onSelectDirectory}
            onPickNewDirectory={onPickNewDirectory}
          />
        </div>

        <div className="p-2">
          {dirTab && (
            <div
              className={`flex gap-2 mx-0.5 mb-2 px-3 py-2 rounded-xl text-[10.5px] leading-relaxed border ${
                isLight ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-amber-500/[0.07] text-amber-200/90 border-amber-500/25'
              }`}
            >
              <Info className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isLight ? 'text-amber-500' : 'text-amber-400'}`} />
              <span>
                Direktori ini sudah aktif di tab <b>{dirTab.agent.name}</b>. Untuk berganti mesin AI, gunakan tombol{' '}
                <b>Ganti Agen</b> di toolbar terminal.
              </span>
            </div>
          )}

          <div className={`px-2 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500`}>
            Mesin AI
          </div>

          <div className="space-y-1">
            {agentProviders.map((agent) => {
              const isTabOpen = dirTab?.agent.id === agent.id;
              const notInstalled = agent.isInstalled === false;
              const badge = AGENT_BADGE[agent.id] ?? AGENT_BADGE.codex;
              return (
                <button
                  key={agent.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onOpenAgent(agent, selectedDirectory)}
                  title={`${agent.name} · ${agent.vendor}`}
                  className={`group w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition cursor-pointer border ${
                    isTabOpen
                      ? isLight
                        ? 'soraja-grad-soft border-blue-200 hover:bg-blue-100/80'
                        : 'bg-cyan-500/[0.07] border-cyan-500/30 hover:bg-cyan-500/10'
                      : isLight
                      ? 'border-transparent hover:bg-slate-50 hover:border-slate-200'
                      : 'border-transparent hover:bg-slate-800/50 hover:border-slate-700/70'
                  } ${notInstalled ? 'opacity-60' : ''}`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition ${
                      isLight
                        ? 'bg-white border-slate-200 shadow-sm'
                        : 'bg-slate-800/70 border-slate-700/60 group-hover:border-slate-600'
                    }`}
                  >
                    {getAgentIcon(agent.id, 'w-[18px] h-[18px]')}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`font-semibold text-[12.5px] truncate ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                        {agent.name}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-px rounded-md border shrink-0 ${isLight ? badge.light : badge.dark}`}
                      >
                        {agent.executable || agent.id}
                      </span>
                    </div>
                    <p className={`text-[10.5px] mt-0.5 truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {notInstalled ? 'CLI belum terpasang di komputer ini' : agent.description || agent.vendor}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {isTabOpen ? (
                      <span
                        className={`flex items-center gap-1 text-[9.5px] font-semibold px-2 py-0.5 rounded-full border ${
                          isLight
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Aktif
                      </span>
                    ) : dirTab ? (
                      <span className={`text-[9.5px] font-medium ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>Terpakai</span>
                    ) : (
                      <span
                        className={`flex items-center gap-1 text-[10px] font-medium opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition ${
                          isLight ? 'text-blue-600' : 'text-cyan-300'
                        }`}
                      >
                        Buka <ArrowRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};
