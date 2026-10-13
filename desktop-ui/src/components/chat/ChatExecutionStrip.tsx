import { Terminal } from 'lucide-react';
import type { ConversationRecord, ProjectRecord } from '../../types/database';
import type { AgentProvider, ModelItem } from '../../types/agent';

interface ChatExecutionStripProps {
  isLight: boolean;
  activeProject: ProjectRecord | null;
  activeConversation: ConversationRecord | null;
  selectedAgent: AgentProvider;
  selectedModel: ModelItem;
  isGenerating: boolean;
  isPaused: boolean;
}

/** Strip status eksekusi agen di atas input chat + pintasan membuka Terminal CLI. */
export function ChatExecutionStrip({
  isLight,
  activeProject,
  activeConversation,
  selectedAgent,
  selectedModel,
  isGenerating,
  isPaused,
}: ChatExecutionStripProps) {
  return (
    <>
      {/* Live Execution Logs Strip (Responsif & Terintegrasi Akses Terminal) */}
      <div
        className={`border-t px-3 sm:px-4 py-1.5 font-mono text-[11px] flex items-center justify-between gap-2 transition-colors min-h-[32px] ${
          isLight
            ? 'border-slate-200/80 bg-gradient-to-r from-slate-100/90 via-slate-50/90 to-slate-100/90 text-slate-600'
            : 'border-slate-800/60 bg-[#090c14] text-slate-400'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
          <Terminal className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
          <span className="flex items-center gap-1 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse shrink-0" />
            <span className={`font-bold hidden xs:inline ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
              MESIN CLI:
            </span>
          </span>
          <span className={`truncate ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
            <span className="font-semibold">{selectedAgent.name}</span>
            <span className="hidden md:inline text-slate-400 font-normal"> ({selectedAgent.executable})</span>
            <span> • Proyek: {activeProject?.name || 'Workspace'}</span>
            {activeConversation?.title && (
              <span className="hidden lg:inline"> • Sesi: {activeConversation.title}</span>
            )}
            <span className="hidden sm:inline"> • Model: {selectedModel.name}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isGenerating && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-bold animate-pulse border shrink-0 ${
                isPaused
                  ? 'text-amber-400 bg-amber-950/40 border-amber-700/50'
                  : 'text-cyan-400 bg-cyan-950/40 border-cyan-800/50'
              }`}
            >
              {isPaused ? '⏸️ Dijeda' : '⚡ Bekerja'}
            </span>
          )}

          <span
            className={`text-[10px] px-2 py-0.5 rounded font-bold border flex items-center gap-1 shrink-0 ${
              isLight
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40'
            }`}
            title="Mesin CLI Aktif & Terhubung"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="hidden xs:inline">Mesin Terhubung</span>
          </span>
        </div>
      </div>
    </>
  );
}
