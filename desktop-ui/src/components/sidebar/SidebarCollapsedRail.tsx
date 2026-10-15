import {
  PanelLeft,
  Plus,
  History,
  Clock,
  Layers,
  Settings,
} from 'lucide-react';
import type { ProjectRecord } from '../../types/database';
import type { AgentProvider } from '../../types/agent';

interface SidebarCollapsedRailProps {
  isLight: boolean;
  isHighContrast: boolean;
  currentModalSidebar: string;
  activeProject: ProjectRecord | null;
  selectedAgent: AgentProvider;
  onToggleSidebar: () => void;
  onCreateNewConversation: () => void;
  onOpenHistory: () => void;
  onOpenTasks: () => void;
  onOpenSettings: () => void;
}

export function SidebarCollapsedRail({
  isLight,
  isHighContrast,
  currentModalSidebar,
  activeProject,
  selectedAgent,
  onToggleSidebar,
  onCreateNewConversation,
  onOpenHistory,
  onOpenTasks,
  onOpenSettings,
}: SidebarCollapsedRailProps) {
  return (
    <aside
      className={`w-[58px] shrink-0 border-r flex flex-col justify-between items-center py-3 shadow-xl relative z-20 transition-all duration-200 ${
        isLight
          ? `bg-white ${isHighContrast ? 'border-r-2 border-slate-300' : 'border-slate-200'} text-slate-800`
          : `${isHighContrast ? 'border-r-2 border-slate-600' : 'border-slate-800/60'} text-slate-100`
      }`}
      style={!isLight ? { backgroundColor: currentModalSidebar } : {}}
    >
      {/* Top Action Icons */}
      <div className="flex flex-col items-center gap-2.5 w-full">
        {/* Toggle Expand Button [|] */}
        <button
          onClick={onToggleSidebar}
          title="Buka Sidebar (Ctrl+B)"
          className={`p-2 rounded-xl border transition cursor-pointer group ${
            isLight
              ? 'bg-slate-100 hover:bg-blue-50 hover:text-blue-600 border-slate-200 text-slate-600 shadow-2xs'
              : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300'
          }`}
        >
          <PanelLeft className="w-4 h-4 transition-transform group-hover:scale-110" />
        </button>

        {/* Brand Dot */}
        <img src="/logo-mark.png" alt="Soraja Engine" className="w-8 h-8 rounded-lg object-contain shadow-[0_4px_12px_rgba(34,211,238,0.25)]" draggable={false} />

        <div className="w-6 h-[1px] bg-slate-200 dark:bg-slate-800 my-1" />

        {/* New Chat Button */}
        <button
          onClick={onCreateNewConversation}
          title="Percakapan Baru (Ctrl+N)"
          className={`p-2 rounded-xl transition cursor-pointer border shadow-sm ${
            isLight
              ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-blue-500/20'
              : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-cyan-400/30'
          }`}
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* History Button */}
        <button
          onClick={onOpenHistory}
          title="Riwayat Percakapan"
          className={`p-2 rounded-xl transition cursor-pointer ${
            isLight
              ? 'text-slate-500 hover:text-blue-600 hover:bg-slate-100'
              : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80'
          }`}
        >
          <History className="w-4 h-4" />
        </button>

        {/* Tasks Button */}
        <button
          onClick={onOpenTasks}
          title="Mesin Tugas Terjadwal"
          className={`p-2 rounded-xl transition cursor-pointer ${
            isLight
              ? 'text-slate-500 hover:text-amber-600 hover:bg-slate-100'
              : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800/80'
          }`}
        >
          <Clock className="w-4 h-4" />
        </button>

        {/* Active Project Indicator */}
        {activeProject && (
          <button
            onClick={onToggleSidebar}
            title={`Proyek Aktif: ${activeProject.name}`}
            className={`p-2 rounded-xl transition cursor-pointer ${
              isLight
                ? 'text-slate-500 hover:text-blue-600 hover:bg-slate-100'
                : 'text-cyan-400 hover:bg-slate-800/80'
            }`}
          >
            <Layers className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Bottom Action Icons */}
      <div className="flex flex-col items-center gap-2 w-full">
        {/* Agent Avatar */}
        <div
          title={`Agen Aktif: ${selectedAgent.name}`}
          className="w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shadow-inner cursor-pointer"
          style={{ backgroundColor: `${selectedAgent.accent}25`, color: selectedAgent.accent }}
        >
          {selectedAgent.icon}
        </div>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Pengaturan"
          className={`p-2 rounded-xl transition cursor-pointer ${
            isLight
              ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
