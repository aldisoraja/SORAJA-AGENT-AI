import { Star, X } from 'lucide-react';
import type { ConversationRecord, ProjectRecord } from '../../types/database';
import { activityTime, fullDateTimeLabel, relativeTimeLabel } from '../../utils/relativeTime';

interface FavoritesModalProps {
  isOpen: boolean;
  conversations: ConversationRecord[];
  projects: ProjectRecord[];
  isLight?: boolean;
  onClose: () => void;
  onSelectConversation: (project: ProjectRecord, conv: ConversationRecord) => void;
  onToggleFavorite: (convId: string) => void;
}

export function FavoritesModal({
  isOpen,
  conversations,
  projects,
  isLight = false,
  onClose,
  onSelectConversation,
  onToggleFavorite,
}: FavoritesModalProps) {
  if (!isOpen) return null;
  const favorites = conversations.filter((c) => c.isFavorite);
  const now = Date.now();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-150">
      <div className={`rounded-3xl max-w-xl w-full p-6 relative overflow-hidden backdrop-blur-xl animate-in zoom-in-95 duration-150 space-y-4 max-h-[80vh] flex flex-col border ${
        isLight
          ? 'bg-white/95 text-slate-800 border-slate-200 shadow-2xl'
          : 'bg-[#0c101a] text-slate-100 border-amber-500/30 shadow-[0_0_50px_-10px_rgba(245,158,11,0.25)]'
      }`}>
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
        <div className={`flex items-center justify-between border-b pb-3 ${
          isLight ? 'border-slate-200' : 'border-slate-800/80'
        }`}>
          <div className="flex items-center gap-2">
            <Star className={`w-5 h-5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <h3 className={`font-bold text-base ${isLight ? 'text-slate-900' : 'text-white'}`}>Percakapan Favorit</h3>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg transition cursor-pointer ${
            isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
          }`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {favorites.length === 0 && (
            <div className={`text-center text-xs py-8 space-y-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              <p className="font-semibold">Belum ada percakapan favorit.</p>
              <p>Buka <b>Riwayat</b>, lalu klik ikon bintang pada percakapan penting agar mudah ditemukan di sini.</p>
            </div>
          )}
          {favorites.map((c) => {
            const proj = projects.find((p) => p.id === c.projectId);
            return (
              <div
                key={c.id}
                onClick={() => {
                  if (proj) onSelectConversation(proj, c);
                  onClose();
                }}
                className={`p-3 rounded-2xl cursor-pointer transition flex items-center justify-between text-xs border ${
                  isLight
                    ? 'bg-slate-50 hover:bg-amber-50/70 border-slate-200 hover:border-amber-300'
                    : 'bg-slate-950/80 hover:bg-slate-800/80 border-slate-800/80 hover:border-amber-500/40'
                }`}
              >
                <div>
                  <p className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{c.title}</p>
                  <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Ruang Kerja: {proj?.name || 'Unknown'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span title={fullDateTimeLabel(activityTime(c))} className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                    {relativeTimeLabel(activityTime(c), now)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(c.id);
                    }}
                    title="Hapus dari Favorit"
                    className="p-1 rounded-lg transition cursor-pointer hover:bg-amber-500/10"
                  >
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
