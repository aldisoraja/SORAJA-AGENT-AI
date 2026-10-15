import type { Dispatch, SetStateAction } from 'react';
import { ChevronDown, ChevronRight, Folder, MessageSquare, MessageSquarePlus, Pin, Star, Terminal, Trash2 } from 'lucide-react';
import type { ConversationRecord, ProjectRecord } from '../../types/database';
import type { SidebarProps } from './Sidebar';
import { groupConversationsByDate } from './conversationGrouping';
import { isCliConversation } from '../../utils/conversationTitle';

type ItemCallbacks = Pick<
  SidebarProps,
  | 'activeConversation'
  | 'onCreateConversationForProject'
  | 'onDeleteProject'
  | 'onToggleFavoriteConversation'
  | 'onSelectConversation'
  | 'onSelectProject'
  | 'onTogglePinProject'
  | 'onToggleProjectCollapsed'
>;

interface SidebarProjectItemProps extends ItemCallbacks {
  isLight: boolean;
  proj: ProjectRecord;
  projConvs: ConversationRecord[];
  isSelectedProject: boolean;
  isCollapsed: boolean;
  expandedRepoChats: Record<string, boolean>;
  setExpandedRepoChats: Dispatch<SetStateAction<Record<string, boolean>>>;
}

/** Satu proyek di pohon sidebar beserta sesi chat yang dikelompokkan per tanggal. */
export function SidebarProjectItem({
  isLight,
  proj,
  projConvs,
  isSelectedProject,
  isCollapsed,
  expandedRepoChats,
  setExpandedRepoChats,
  activeConversation,
  onCreateConversationForProject,
  onDeleteProject,
  onToggleFavoriteConversation,
  onSelectConversation,
  onSelectProject,
  onTogglePinProject,
  onToggleProjectCollapsed,
}: SidebarProjectItemProps) {
  return (
    <div
      className={`rounded-xl transition-all duration-150 ${
        isSelectedProject
          ? isLight
            ? 'soraja-grad-soft ring-1 ring-blue-200/60'
            : 'bg-slate-900/40 ring-1 ring-slate-800/80'
          : ''
      }`}
    >
      {/* Project Item Row (DeSaIn Style) */}
      <div
        onClick={() => onSelectProject(proj)}
        className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer group select-none transition ${
          isSelectedProject
            ? isLight
              ? 'soraja-grad-soft text-blue-900 font-medium'
              : 'bg-slate-800/80 text-cyan-300'
            : isLight
            ? 'hover:bg-slate-100/70 text-slate-700'
            : 'hover:bg-slate-800/50 text-slate-300'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate mr-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleProjectCollapsed(proj.id);
            }}
            className="p-0.5 hover:bg-black/5 dark:hover:bg-white/5 rounded transition text-slate-400 shrink-0"
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-xs font-bold truncate block">
            {proj.name}
          </span>
          {proj.isPinned && (
            <span
              className={`text-[9px] px-1 py-0.2 rounded font-semibold uppercase tracking-wider shrink-0 ${
                isLight
                  ? 'bg-amber-100 text-amber-800 border border-amber-300/80'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
              title="Proyek disematkan di posisi teratas"
            >
              Disematkan
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Counter Jumlah Percakapan di Proyek Ini */}
          {projConvs.length > 0 && (
            <span
              className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                isLight ? 'text-slate-600 bg-slate-100' : 'text-slate-300 bg-slate-800'
              }`}
              title={`${projConvs.length} sesi percakapan`}
            >
              {projConvs.length}
            </span>
          )}

          {/* Tombol New Sesi Chat GUI untuk Proyek ini (Ikon Session Chat tanpa teks Percakapan) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateConversationForProject(proj, e);
            }}
            className={`h-6 w-6 rounded-md border transition cursor-pointer flex items-center justify-center shrink-0 ${
              isLight
                ? 'bg-white hover:bg-blue-50 text-blue-700 border-slate-300 hover:border-blue-400 shadow-2xs'
                : 'bg-slate-800/90 hover:bg-cyan-950/80 text-cyan-300 border-slate-700 hover:border-cyan-500/50 shadow-2xs'
            }`}
            title={`Percakapan baru di proyek ${proj.name}`}
            aria-label={`Percakapan baru di proyek ${proj.name}`}
          >
            <MessageSquarePlus className="w-3.5 h-3.5 text-cyan-400" />
          </button>

          {/* Tombol Sematkan / Pin Proyek (Selalu tampak bila sedang di-pin) */}
          <button
            onClick={(e) => onTogglePinProject(proj.id, e)}
            title={proj.isPinned ? 'Lepas sematan proyek' : 'Sematkan proyek di posisi teratas'}
            className={`p-1 rounded transition cursor-pointer shrink-0 ${
              proj.isPinned
                ? 'text-amber-500 hover:text-amber-400 bg-amber-500/15 dark:bg-amber-400/20 opacity-100 ring-1 ring-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10'
            }`}
          >
            <Pin className={`w-3 h-3 ${proj.isPinned ? 'fill-amber-500' : ''}`} />
          </button>

          {/* Tombol Hapus Proyek (Muncul saat hover baris) */}
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={(e) => onDeleteProject(proj.id, e)}
              title="Hapus proyek dari daftar (riwayat percakapannya ikut terhapus; folder asli aman)"
              className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-500 transition cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Sub-items Proyek: Murni Sesi Chat Dikelompokkan Berdasarkan Tanggal, Bulan & Tahun */}
      {!isCollapsed && (
        <div className="relative pl-5 pr-1 py-1 space-y-1.5">
          {/* Tree vertical guide line */}
          <div className="absolute left-3.5 top-1 bottom-2 w-px bg-gradient-to-b from-cyan-500/40 via-slate-700/40 to-transparent" />

          {projConvs.length === 0 ? (
            <div className="pl-2 py-1.5 text-[11px] text-slate-400 italic flex items-center justify-between">
              <span>Belum ada percakapan</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateConversationForProject(proj, e);
                }}
                className="text-[10px] font-semibold text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                + Mulai percakapan
              </button>
            </div>
          ) : (
            (() => {
              const isRepoExpanded = expandedRepoChats[proj.id] ?? false;
              // Urutkan dari yang terbaru. Hanya ID kembar yang dibuang; judul sama tetap ditampilkan
              // agar angka di sidebar sama dengan jumlah baris yang terlihat.
              const seenIds = new Set<string>();
              const uniqueConvs: ConversationRecord[] = [];

              for (const c of projConvs) {
                if (!c || !c.id || seenIds.has(c.id)) continue;
                seenIds.add(c.id);
                uniqueConvs.push(c);
              }

              const sortedConvs = uniqueConvs.sort((a, b) => {
                const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
                const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
                return timeB - timeA;
              });

              // Default hanya tampilkan 3 teratas, jika di-expand tampilkan semua
              const visibleConvs = isRepoExpanded ? sortedConvs : sortedConvs.slice(0, 3);
              const groupedConvs = groupConversationsByDate(visibleConvs);

              return (
                <div className="space-y-1.5">
                  {groupedConvs.map((group) => (
                    <div key={group.label} className="space-y-0.5">
                      {/* Header Kategori Tanggal: lencana kalender + judul + hari & tanggal lengkap */}
                      <div className="flex items-center gap-2.5 pl-1 pr-1 pt-2 pb-1.5 select-none">
                        <div
                          className={`w-8 h-8 rounded-lg overflow-hidden shrink-0 flex flex-col items-stretch text-center leading-none border ${
                            isLight ? 'border-slate-300/80 bg-white shadow-2xs' : 'border-slate-700/70 bg-slate-900/80'
                          }`}
                          aria-hidden="true"
                        >
                          <span className={`text-[7px] font-bold tracking-[0.12em] py-[2.5px] text-white ${isLight ? 'soraja-grad-fill' : 'bg-gradient-to-r from-cyan-500 to-blue-500'}`}>
                            {group.badge.top}
                          </span>
                          <span
                            className={`flex-1 flex items-center justify-center text-[11px] font-extrabold ${
                              isLight ? 'text-slate-800' : 'text-slate-100'
                            }`}
                          >
                            {group.badge.bottom}
                          </span>
                        </div>
                        <div className="flex flex-col min-w-0 flex-1 gap-[3px]">
                          <span
                            className={`text-[11px] font-bold tracking-wide truncate ${
                              isLight ? 'text-slate-800' : 'text-slate-100'
                            }`}
                          >
                            {group.title}
                          </span>
                          {group.subtitle && (
                            <span className="text-[10px] truncate text-slate-500">{group.subtitle}</span>
                          )}
                        </div>
                        <span
                          title={`${group.items.length} percakapan pada tanggal ini`}
                          className={`text-[10px] min-w-[20px] text-center px-1.5 py-0.5 rounded-full font-mono font-semibold ${
                            isLight ? 'bg-slate-200/80 text-slate-600' : 'bg-slate-800/80 text-slate-400'
                          }`}
                        >
                          {group.items.length}
                        </span>
                      </div>

                      {/* Daftar Percakapan dalam Kategori ini */}
                      <div className="space-y-0.5 pl-1">
                        {group.items.map((conv) => {
                          const isSelectedConv = activeConversation?.id === conv.id;
                          return (
                            <div
                              key={conv.id}
                              onClick={() => onSelectConversation(proj, conv)}
                              className={`relative flex items-center justify-between gap-2 pl-3 pr-2 py-1.5 rounded-lg text-xs cursor-pointer transition-all duration-150 select-none group ${
                                isSelectedConv
                                  ? isLight
                                    ? 'soraja-grad-soft text-blue-900 font-semibold'
                                    : 'bg-gradient-to-r from-cyan-500/15 to-transparent text-cyan-100 font-semibold'
                                  : isLight
                                  ? 'hover:bg-slate-100 text-slate-700'
                                  : 'hover:bg-slate-800/50 text-slate-300'
                              }`}
                              title={`${conv.title} (${conv.timeAgo})`}
                            >
                              <span
                                className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-150 ${
                                  isSelectedConv
                                    ? 'h-4 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]'
                                    : 'h-0 group-hover:h-2.5 bg-slate-500/60'
                                }`}
                              />
                              {isCliConversation(conv) ? (
                                <Terminal className="w-3 h-3 shrink-0 text-emerald-400" aria-label="Sesi Terminal" />
                              ) : (
                                <MessageSquare className="w-3 h-3 shrink-0 text-cyan-400/80" aria-label="Sesi Chat" />
                              )}
                              <span className="truncate text-[11.5px] flex-1 min-w-0">{conv.title}</span>
                              <button
                                onClick={(e) => onToggleFavoriteConversation(conv.id, e)}
                                title={conv.isFavorite ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}
                                aria-label={conv.isFavorite ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}
                                className={`p-0.5 rounded shrink-0 cursor-pointer transition ${
                                  conv.isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                }`}
                              >
                                <Star
                                  className={`w-3 h-3 ${
                                    conv.isFavorite ? 'text-amber-400 fill-amber-400' : 'text-slate-400 hover:text-amber-400'
                                  }`}
                                />
                              </button>
                              <span
                                className={`text-[9.5px] shrink-0 tabular-nums group-hover:hidden ${
                                  isSelectedConv ? 'text-cyan-300/80' : 'text-slate-500'
                                }`}
                              >
                                {conv.timeAgo}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Tombol Klik Semua / Dropdown Toggle jika total percakapan > 3 */}
                  {projConvs.length > 3 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedRepoChats((prev) => ({
                          ...prev,
                          [proj.id]: !prev[proj.id],
                        }));
                      }}
                      className={`w-full mt-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold flex items-center justify-between transition cursor-pointer border ${
                        isLight
                          ? 'bg-slate-100/90 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border-slate-200'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 border-slate-800 hover:border-cyan-500/40'
                      }`}
                      title={isRepoExpanded ? 'Sembunyikan dan tampilkan 3 percakapan teratas' : `Tampilkan semua riwayat (${projConvs.length} chat)`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <MessageSquare className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span className="truncate">
                          {isRepoExpanded
                            ? 'Tampilkan lebih sedikit'
                            : `Tampilkan semua percakapan (${projConvs.length})`}
                        </span>
                      </span>
                      <ChevronDown
                        className={`w-3 h-3 shrink-0 transition-transform duration-200 ml-1 ${
                          isRepoExpanded ? 'rotate-180 text-cyan-400' : 'text-slate-400'
                        }`}
                      />
                    </button>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}
