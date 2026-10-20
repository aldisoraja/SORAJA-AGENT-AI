import { History, Star, X } from 'lucide-react';
import type { ConversationRecord, ProjectRecord } from '../../types/database';
import { groupConversationsByDate } from '../sidebar/conversationGrouping';
import { activityTime, fullDateTimeLabel, historyTimeLabel } from '../../utils/relativeTime';

interface HistoryModalProps {
  isOpen: boolean;
  conversations: ConversationRecord[];
  projects: ProjectRecord[];
  isLight?: boolean;
  onClose: () => void;
  onSelectConversation: (project: ProjectRecord, conv: ConversationRecord) => void;
  onToggleFavorite: (convId: string) => void;
}

export function HistoryModal({
  isOpen,
  conversations,
  projects,
  isLight = false,
  onClose,
  onSelectConversation,
  onToggleFavorite,
}: HistoryModalProps) {
  if (!isOpen) return null;
  // Dihitung saat modal dibuka (modal berumur pendek, tidak perlu detak per menit).
  const now = Date.now();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-150">
      <div className={`rounded-3xl max-w-xl w-full p-6 relative overflow-hidden backdrop-blur-xl animate-in zoom-in-95 duration-150 space-y-4 max-h-[80vh] flex flex-col border ${
        isLight
          ? 'bg-white/95 text-slate-800 border-slate-200 shadow-2xl'
          : 'bg-[#0c101a] text-slate-100 border-blue-500/30 shadow-[0_0_50px_-10px_rgba(59,130,246,0.25)]'
      }`}>
        <div className={`absolute top-0 left-0 right-0 h-1 ${isLight ? 'soraja-grad-line' : 'bg-gradient-to-r from-transparent via-blue-500 to-transparent'}`} />
        <div className={`flex items-center justify-between border-b pb-3 ${
          isLight ? 'border-slate-200' : 'border-slate-800/80'
        }`}>
          <div className="flex items-center gap-2">
            <History className={`w-5 h-5 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
            <h3 className={`font-bold text-base ${isLight ? 'text-slate-900' : 'text-white'}`}>Riwayat Percakapan</h3>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg transition cursor-pointer ${
            isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
          }`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {groupConversationsByDate(conversations, now).map((group) => (
            <section key={group.label} className="space-y-2">
              <h4 className={`px-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                {group.label}
              </h4>
              {group.items.map((c) => {
                const proj = projects.find((p) => p.id === c.projectId);
                const time = activityTime(c);
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      if (proj) onSelectConversation(proj, c);
                      onClose();
                    }}
                    className={`p-3 rounded-2xl cursor-pointer transition flex items-center justify-between text-xs border ${
                      isLight
                        ? 'bg-slate-50 hover:bg-blue-50/70 border-slate-200 hover:border-blue-300'
                        : 'bg-slate-950/80 hover:bg-slate-800/80 border-slate-800/80 hover:border-blue-500/40'
                    }`}
                  >
                    <div>
                      <p className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{c.title}</p>
                      <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Ruang Kerja: {proj?.name || 'Unknown'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span title={fullDateTimeLabel(time)} className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                        {historyTimeLabel(time, now)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(c.id);
                        }}
                        title={c.isFavorite ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}
                        className="p-1 rounded-lg transition cursor-pointer hover:bg-amber-500/10"
                      >
                        <Star className={`w-4 h-4 ${c.isFavorite ? 'text-amber-400 fill-amber-400' : isLight ? 'text-slate-400' : 'text-slate-500'}`} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
