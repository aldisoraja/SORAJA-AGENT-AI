import { useEffect, useMemo, useState } from 'react';
import { Check, EyeOff, Search, Terminal, Zap } from 'lucide-react';
import type { AgentProvider, ModelItem } from '../../types/agent';
import type { CliAgentStatus } from '../../services/cliAdapters';
import { getAgentIcon } from '../AgentIcons';

interface ModelSelectorDropdownProps {
  isOpen: boolean;
  selectedAgent: AgentProvider;
  selectedModel: ModelItem;
  agentProviders?: AgentProvider[];
  installedCliAgents?: Record<string, CliAgentStatus>;
  isLight?: boolean;
  onSelectModel: (model: ModelItem) => void;
  onSelectAgent?: (agent: AgentProvider) => void;
  onClose: () => void;
  onOpenUsageModal: () => void;
}

function badgeClass(badge: string | undefined, isLight: boolean): string {
  const b = (badge || '').toUpperCase();
  const tone =
    b === 'PRO' || b === 'FLAGSHIP' || b === 'ULTRA'
      ? 'blue'
      : b === 'FLASH' || b === 'FAST'
      ? 'amber'
      : b === 'NEW' || b === 'PREVIEW'
      ? 'emerald'
      : b === 'THINKING' || b === 'REASONING' || b === 'HYBRID'
      ? 'purple'
      : 'slate';
  const light: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    purple: 'bg-violet-100 text-violet-700 border-violet-200',
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const dark: Record<string, string> = {
    blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    purple: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    slate: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
  };
  return (isLight ? light : dark)[tone];
}

export function ModelSelectorDropdown({
  isOpen,
  selectedAgent,
  selectedModel,
  agentProviders = [],
  installedCliAgents = {},
  isLight = false,
  onSelectModel,
  onSelectAgent,
  onClose,
  onOpenUsageModal,
}: ModelSelectorDropdownProps) {
  // ⚠️ Seluruh hook WAJIB dipanggil sebelum `if (!isOpen) return null` (Rules of Hooks).
  const [searchQuery, setSearchQuery] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');

  const agentModels = useMemo(() => selectedAgent?.models ?? [], [selectedAgent]);
  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return agentModels;
    return agentModels.filter((m) => [m.name, m.id, m.badge].some((v) => v && v.toLowerCase().includes(q)));
  }, [agentModels, searchQuery]);

  // Reset state lokal setiap kali dropdown ditutup atau agen berganti
  useEffect(() => {
    setSearchQuery('');
  }, [isOpen, selectedAgent.id]);

  if (!isOpen) return null;

  const handleModelClick = (model: ModelItem) => {
    onSelectModel(model);
    onClose();
  };

  const surface = isLight
    ? 'bg-white/95 border-slate-200 text-slate-800 shadow-xl shadow-slate-300/40'
    : 'bg-[#0c101a]/95 border-slate-800 text-slate-200 shadow-2xl shadow-black/60';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const accentText = isLight ? 'text-blue-600' : 'text-cyan-400';

  return (
    <div className="absolute bottom-20 left-12 z-40 select-none animate-in fade-in zoom-in-95 duration-100">
      <div className={`w-[360px] max-w-[calc(100vw-5rem)] backdrop-blur-2xl border rounded-2xl p-2 ${surface}`}>
        {/* Tab agen: ganti agen → daftar model ikut berganti */}
        {agentProviders.length > 0 && (
          <div className={`grid grid-cols-4 gap-1 p-1 mb-2 rounded-xl ${isLight ? 'bg-slate-100' : 'bg-slate-900/80'}`}>
            {agentProviders.map((agent) => {
              const active = agent.id === selectedAgent.id;
              const installed = installedCliAgents[agent.id]?.is_installed ?? agent.isInstalled ?? true;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => !active && onSelectAgent?.(agent)}
                  title={installed ? agent.name : `${agent.name} — CLI belum terpasang`}
                  className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                    active
                      ? isLight
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'bg-slate-800 text-cyan-300 shadow'
                      : isLight
                      ? 'text-slate-500 hover:text-slate-800'
                      : 'text-slate-400 hover:text-slate-100'
                  } ${installed ? '' : 'opacity-50'}`}
                >
                  <span className="w-4 h-4 flex items-center justify-center">{getAgentIcon(agent.id, 'w-4 h-4')}</span>
                  <span className="truncate max-w-full px-1">{agent.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className={`flex items-center justify-between px-2 pb-1.5 text-[11px] ${muted}`}>
          <span className="font-semibold">Model {selectedAgent.name}</span>
          <span className="font-mono text-[10px]">{agentModels.length} model · live dari CLI</span>
        </div>

        {agentModels.length > 5 && (
          <div className={`flex items-center gap-1.5 mx-1 mb-1.5 px-2 py-1.5 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'}`}>
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              autoFocus
              placeholder="Cari model…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent outline-none text-[11px] placeholder:text-slate-500"
            />
          </div>
        )}

        {agentModels.length === 0 ? (
          <div className="py-4 px-2 text-center">
            <Terminal className="w-6 h-6 mx-auto mb-1.5 text-slate-500 opacity-60" />
            <p className="text-xs font-semibold mb-0.5">Belum ada model terdeteksi dari CLI {selectedAgent.name}</p>
            <p className={`text-[10px] mb-2.5 ${muted}`}>
              Pastikan <code className="font-mono">{selectedAgent.executable}</code> terpasang & sudah login, atau ketik ID model.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const id = customModelInput.trim();
                if (!id) return;
                onSelectModel({ id, name: id, speed: 'CLI', desc: `Model custom untuk ${selectedAgent.name}` });
                onClose();
              }}
              className="flex items-center gap-1"
            >
              <input
                type="text"
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                placeholder="ID model, mis. gpt-5-codex"
                className={`w-full text-[11px] px-2 py-1 rounded-lg border bg-transparent outline-none ${isLight ? 'border-slate-300' : 'border-slate-700'}`}
              />
              <button type="submit" className={`text-[10px] font-bold px-2 py-1 rounded-lg text-white shrink-0 cursor-pointer ${isLight ? 'soraja-grad-primary' : 'bg-blue-600 hover:bg-blue-500'}`}>
                Pilih
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-0.5 max-h-72 overflow-y-auto overflow-x-hidden pr-0.5 scrollbar-thin">
            {filteredModels.length === 0 && (
              <div className={`py-4 text-center text-xs ${muted}`}>Tidak ada model yang cocok dengan "{searchQuery}"</div>
            )}
            {filteredModels.map((model) => {
              const isCurrent = selectedModel.id === model.id;
              return (
                <div
                  key={model.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleModelClick(model)}
                  className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs cursor-pointer transition ${
                    isCurrent
                      ? isLight
                        ? 'soraja-grad-soft text-blue-800 ring-1 ring-blue-200'
                        : 'bg-cyan-500/10 text-cyan-100 ring-1 ring-cyan-500/30'
                      : isLight
                      ? 'hover:bg-slate-100'
                      : 'hover:bg-slate-800/70'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="truncate font-medium">{model.name}</span>
                    {model.badge && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide shrink-0 ${badgeClass(model.badge, isLight)}`}>
                        {model.badge}
                      </span>
                    )}
                    {model.supportsImages === false && (
                      <span title="Model ini tidak bisa membaca gambar" className={`shrink-0 ${muted}`}>
                        <EyeOff className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <div className={`flex items-center gap-1.5 shrink-0 text-[10px] ${muted}`}>
                    <span className="font-mono">{model.speed}</span>
                    {isCurrent && <Check className={`w-3.5 h-3.5 ${accentText}`} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className={`border-t mt-1.5 pt-1 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <button
            onClick={() => {
              onClose();
              onOpenUsageModal();
            }}
            className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer transition ${isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800/70'}`}
          >
            <Zap className={`w-3.5 h-3.5 ${accentText}`} /> Lihat kuota
          </button>
        </div>
      </div>

    </div>
  );
}
