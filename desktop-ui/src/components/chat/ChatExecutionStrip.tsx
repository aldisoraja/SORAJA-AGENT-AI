import { FolderOpen } from 'lucide-react';
import type { ConversationRecord, ProjectRecord } from '../../types/database';
import type { AgentProvider, ModelItem } from '../../types/agent';
import { getAgentIcon } from '../AgentIcons';
import { hasHeadlessBridge, isTauriRuntime } from '../../services/headlessTransport';

interface ChatExecutionStripProps {
  isLight: boolean;
  activeProject: ProjectRecord | null;
  activeConversation: ConversationRecord | null;
  selectedAgent: AgentProvider;
  selectedModel: ModelItem;
  isGenerating: boolean;
  isPaused: boolean;
  /** CLI agen terpilih terdeteksi terpasang di komputer ini. */
  cliInstalled: boolean;
}

type StripState = 'working' | 'paused' | 'ready' | 'fallback';

/**
 * Strip status eksekusi di atas input chat. Status mengikuti kondisi nyata yang sama dengan
 * `useChatGeneration`: CLI dijalankan hanya bila ada transport (Tauri/Vite), proyek aktif, dan CLI terpasang.
 */
export function ChatExecutionStrip({
  isLight,
  activeProject,
  activeConversation,
  selectedAgent,
  selectedModel,
  isGenerating,
  isPaused,
  cliInstalled,
}: ChatExecutionStripProps) {
  const canRun = (isTauriRuntime || hasHeadlessBridge) && !!activeProject && cliInstalled;
  const state: StripState = isGenerating ? (isPaused ? 'paused' : 'working') : canRun ? 'ready' : 'fallback';
  const fallbackReason = !(isTauriRuntime || hasHeadlessBridge)
    ? 'Transport CLI tidak tersedia di browser ini'
    : !activeProject
      ? 'Belum ada proyek aktif'
      : `CLI ${selectedAgent.executable || selectedAgent.id} belum terpasang`;

  const STATE = {
    working: { label: 'Bekerja', dot: 'bg-cyan-400 animate-pulse', pill: isLight ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-cyan-300 bg-cyan-500/10 border-cyan-500/25' },
    paused: { label: 'Dijeda', dot: 'bg-amber-400', pill: isLight ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
    ready: { label: 'CLI siap', dot: 'bg-emerald-400', pill: isLight ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
    fallback: { label: 'Mode cadangan', dot: 'bg-amber-400', pill: isLight ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
  }[state];

  const muted = isLight ? 'text-slate-400' : 'text-slate-500';

  return (
    <div
      className={`border-t px-3 sm:px-4 py-1.5 text-[11px] flex items-center justify-between gap-2 min-h-[32px] transition-colors ${
        isLight ? 'border-slate-200/80 bg-slate-50/90 text-slate-600' : 'border-white/[0.05] bg-[#090c14] text-slate-400'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="shrink-0">{getAgentIcon(selectedAgent.id, 'w-3.5 h-3.5')}</span>
        <span className={`font-semibold shrink-0 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{selectedAgent.name}</span>
        <span className={`hidden sm:inline truncate ${muted}`}>{selectedModel.name}</span>
        <span className={`hidden md:flex items-center gap-1 min-w-0 ${muted}`} title={activeProject?.path}>
          <span className="opacity-50">·</span>
          <FolderOpen className="w-3 h-3 shrink-0" />
          <span className="truncate">{activeProject?.name || 'Belum ada proyek'}</span>
        </span>
        {activeConversation?.title && (
          <span className={`hidden lg:inline truncate ${muted}`}>
            <span className="opacity-50">· </span>
            {activeConversation.title}
          </span>
        )}
      </div>

      <span
        title={state === 'fallback' ? `${fallbackReason}: jawaban disusun lokal, bukan dari agen sungguhan.` : undefined}
        className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10.5px] font-semibold ${STATE.pill}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${STATE.dot}`} />
        {STATE.label}
      </span>
    </div>
  );
}
