import {
  PanelLeft,
  History,
  Clock,
  Plus,
} from 'lucide-react';

interface SidebarHeaderProps {
  isLight: boolean;
  dbHealth?: { mode: string; sizeKb: string } | null;
  conversationsCount: number;
  scheduledTasksCount: number;
  onToggleSidebar: () => void;
  onOpenSettings?: () => void;
  onOpenHistory: () => void;
  onOpenTasks: () => void;
  onCreateNewConversation: () => void;
}

export function SidebarHeader({
  isLight,
  dbHealth: _dbHealth,
  conversationsCount,
  scheduledTasksCount,
  onToggleSidebar,
  onOpenSettings: _onOpenSettings,
  onOpenHistory,
  onOpenTasks,
  onCreateNewConversation,
}: SidebarHeaderProps) {
  return (
    <div
      className={`border-b ${
        isLight
          ? 'border-slate-200/90 bg-gradient-to-b from-blue-50/50 via-slate-50 to-transparent'
          : 'border-slate-800/80 bg-gradient-to-b from-[#0e1322] to-transparent'
      }`}
    >

      {/* 2. Top Navigation & Toggle Sidebar Row (Ref: media_1791278606980.png) */}
      <div className="px-3 pt-2 pb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {/* Logo / Brand Mark */}
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-xs shadow-sm">
            S
          </div>

          {/* Toggle Sidebar Icon Button [|] */}
          <button
            onClick={onToggleSidebar}
            title="Toggle Sidebar (Ctrl+B)"
            className={`p-1.5 rounded-lg border transition cursor-pointer group flex items-center justify-center ${
              isLight
                ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 hover:text-blue-600 shadow-2xs'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300'
            }`}
          >
            <PanelLeft className="w-3.5 h-3.5 transition-transform group-hover:scale-105" />
          </button>
        </div>
      </div>

      {/* 3. Quick Actions (Riwayat & Tugas) */}
      <div className="px-3 pb-2 pt-1">
        <div className="grid grid-cols-2 gap-1.5 text-[11px] font-semibold">
          <button
            onClick={onOpenHistory}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition cursor-pointer ${
              isLight
                ? 'bg-white/90 hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs'
                : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-800 text-slate-300'
            }`}
          >
            <History className={`w-3.5 h-3.5 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
            <span>Riwayat ({conversationsCount})</span>
          </button>
          <button
            onClick={onOpenTasks}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition cursor-pointer ${
              isLight
                ? 'bg-white/90 hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs'
                : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-800 text-slate-300'
            }`}
          >
            <Clock className={`w-3.5 h-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <span>Tugas ({scheduledTasksCount})</span>
          </button>
        </div>
      </div>

      {/* 4. "+ New Conversation" Button (Ctrl+N) */}
      <div className="px-3 pb-2.5">
        <button
          onClick={onCreateNewConversation}
          className={`w-full relative group overflow-hidden rounded-xl p-[1px] cursor-pointer transition shadow-md ${
            isLight ? 'shadow-blue-500/10 hover:shadow-blue-500/25' : 'shadow-cyan-500/5 hover:shadow-cyan-500/15'
          }`}
        >
          <div
            className={`absolute inset-0 rounded-xl transition group-hover:opacity-100 ${
              isLight
                ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 opacity-95'
                : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 opacity-80'
            }`}
          />
          <div
            className={`relative rounded-[11px] px-3.5 py-2 flex items-center justify-between transition ${
              isLight
                ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 group-hover:from-blue-700 text-white'
                : 'bg-[#0d121f] group-hover:bg-[#0f1626] text-slate-100'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Plus className="w-3.5 h-3.5" />
              <span>Percakapan Baru</span>
            </div>
            <span
              className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border ${
                isLight ? 'bg-white/20 text-white border-white/20' : 'bg-slate-800/80 text-slate-400 border-slate-700/60'
              }`}
            >
              Ctrl+N
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
