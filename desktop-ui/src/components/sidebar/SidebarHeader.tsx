import {
  PanelLeft,
  History,
  Star,
  Plus,
} from 'lucide-react';

interface SidebarHeaderProps {
  isLight: boolean;
  dbHealth?: { mode: string; sizeKb: string } | null;
  conversationsCount: number;
  favoritesCount: number;
  onToggleSidebar: () => void;
  onOpenSettings?: () => void;
  onOpenHistory: () => void;
  onOpenFavorites: () => void;
  onCreateNewConversation: () => void;
}

export function SidebarHeader({
  isLight,
  dbHealth: _dbHealth,
  conversationsCount,
  favoritesCount,
  onToggleSidebar,
  onOpenSettings: _onOpenSettings,
  onOpenHistory,
  onOpenFavorites,
  onCreateNewConversation,
}: SidebarHeaderProps) {
  return (
    <div
      className={`border-b ${
        isLight
          ? 'border-slate-200/90 bg-gradient-to-b from-indigo-50/60 via-slate-50/70 to-transparent'
          : 'border-slate-800/80 bg-gradient-to-b from-[#0e1322] to-transparent'
      }`}
    >

      {/* 2. Top Navigation & Toggle Sidebar Row (Ref: media_1791278606980.png) */}
      <div className="px-3 pt-2 pb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {/* Logo / Brand Mark (sama dengan aplikasi web) */}
          <img
            src="/logo-mark.png"
            alt="Soraja Engine"
            className="w-8 h-8 rounded-lg object-contain shadow-[0_4px_12px_rgba(34,211,238,0.25)]"
            draggable={false}
          />
          <span
            className={`text-[13px] font-extrabold tracking-tight mr-1 ${
              isLight ? 'soraja-grad-text' : 'bg-gradient-to-br from-cyan-400 to-blue-500 bg-clip-text text-transparent'
            }`}
          >
            SORAJA ENGINE
          </span>

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

      {/* 3. Quick Actions (Riwayat & Favorit) */}
      <div className="px-3 pb-2 pt-1">
        <div className="grid grid-cols-2 gap-1.5 text-[11px] font-semibold">
          <button
            onClick={onOpenHistory}
            title="Lihat dan cari semua percakapan Anda"
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
            onClick={onOpenFavorites}
            title="Percakapan yang Anda beri bintang (klik ikon bintang di baris percakapan untuk menambah)"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition cursor-pointer ${
              isLight
                ? 'bg-white/90 hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs'
                : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-800 text-slate-300'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <span>Favorit ({favoritesCount})</span>
          </button>
        </div>
      </div>

      {/* 4. "+ New Conversation" Button (Ctrl+N) */}
      <div className="px-3 pb-2.5">
        <button
          onClick={onCreateNewConversation}
          title="Mulai percakapan baru di folder/direktori baru — pilih folder lebih dulu (Ctrl+N)"
          className={`w-full relative group overflow-hidden rounded-xl cursor-pointer transition ${
            isLight ? 'soraja-grad-primary' : 'p-[1px] shadow-md shadow-cyan-500/5 hover:shadow-cyan-500/15'
          }`}
        >
          {!isLight && (
            <div className="absolute inset-0 rounded-xl transition group-hover:opacity-100 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 opacity-80" />
          )}
          <div
            className={`relative rounded-[11px] px-3.5 py-2 flex items-center justify-between transition ${
              isLight ? 'text-white' : 'bg-[#0d121f] group-hover:bg-[#0f1626] text-slate-100'
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
