import { Clock, X } from 'lucide-react';
import type { ScheduledTaskRecord } from '../../types/database';

interface TasksModalProps {
  isOpen: boolean;
  scheduledTasks: ScheduledTaskRecord[];
  isLight?: boolean;
  onClose: () => void;
  onToggleTask: (taskId: string) => Promise<void>;
}

export function TasksModal({
  isOpen,
  scheduledTasks,
  isLight = false,
  onClose,
  onToggleTask,
}: TasksModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-150">
      <div className={`rounded-3xl max-w-lg w-full p-6 relative overflow-hidden backdrop-blur-xl animate-in zoom-in-95 duration-150 space-y-4 border ${
        isLight
          ? 'bg-white/95 text-slate-800 border-slate-200 shadow-2xl'
          : 'bg-[#0c101a] text-slate-100 border-amber-500/30 shadow-[0_0_50px_-10px_rgba(245,158,11,0.25)]'
      }`}>
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
        <div className={`flex items-center justify-between border-b pb-3 ${
          isLight ? 'border-slate-200' : 'border-slate-800/80'
        }`}>
          <div className="flex items-center gap-2">
            <Clock className={`w-5 h-5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <h3 className={`font-bold text-base ${isLight ? 'text-slate-900' : 'text-white'}`}>Mesin Tugas Terjadwal</h3>
          </div>
          <button onClick={onClose} className={`p-1 rounded-lg transition cursor-pointer ${
            isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
          }`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2 text-xs">
          {scheduledTasks.map((st) => (
            <div key={st.id} className={`p-3 rounded-2xl flex items-center justify-between border ${
              isLight
                ? 'bg-slate-50 border-slate-200 text-slate-800'
                : 'bg-slate-950/80 border-slate-800/80 text-slate-200'
            }`}>
              <div>
                <p className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{st.name}</p>
                <p className={`text-[11px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{st.schedule} • Berikutnya: {st.nextRun}</p>
              </div>
              <button
                onClick={() => onToggleTask(st.id)}
                className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono border cursor-pointer ${
                  isLight
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                }`}
              >
                {st.status}
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className={`px-5 py-2.5 font-bold text-xs rounded-xl transition cursor-pointer shadow-md ${
              isLight
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-amber-500/20'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-950/40'
            }`}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
