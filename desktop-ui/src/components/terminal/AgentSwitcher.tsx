import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Repeat } from 'lucide-react';
import type { AgentProvider } from '../../types/agent';
import { getAgentIcon } from '../AgentIcons';

interface AgentSwitcherProps {
  isLight: boolean;
  agents: AgentProvider[];
  activeAgentId: string;
  /** Dipanggil dengan agen baru; pemanggil mematikan PTY lama dan menjalankan PTY agen baru di tab yang sama. */
  onSwitch: (agent: AgentProvider) => void;
}

/** Dropdown "Ganti Agen" untuk tab aktif: direktori tetap, mesin AI berganti di tempat. */
export const AgentSwitcher: React.FC<AgentSwitcherProps> = ({ isLight, agents, activeAgentId, onSwitch }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = agents.find((a) => a.id === activeAgentId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title="Ganti mesin AI pada tab ini (sesi lama dihentikan, direktori tetap)"
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-semibold transition cursor-pointer ${
          isLight
            ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
        }`}
      >
        <Repeat className="w-3 h-3 text-cyan-400 shrink-0" />
        <span className="hidden sm:inline">Ganti Agen:</span>
        <span className="shrink-0">{getAgentIcon(activeAgentId, 'w-3.5 h-3.5')}</span>
        <span className="truncate max-w-[90px]">{active?.name ?? activeAgentId}</span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>

      {open && (
        <div
          className={`absolute right-0 top-full mt-1.5 w-60 rounded-xl border p-1.5 z-[60] shadow-2xl backdrop-blur-xl ${
            isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#101626] border-slate-700 text-slate-200'
          }`}
        >
          {agents.map((agent) => {
            const isCurrent = agent.id === activeAgentId;
            return (
              <button
                key={agent.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  if (!isCurrent) onSwitch(agent);
                }}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition cursor-pointer ${
                  isCurrent
                    ? isLight
                      ? 'bg-blue-50 text-blue-800'
                      : 'bg-cyan-500/10 text-cyan-200'
                    : isLight
                    ? 'hover:bg-slate-100'
                    : 'hover:bg-slate-800/80'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0">{getAgentIcon(agent.id, 'w-4 h-4')}</span>
                  <span className="font-semibold truncate">{agent.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">({agent.executable || agent.id})</span>
                </span>
                {isCurrent && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
