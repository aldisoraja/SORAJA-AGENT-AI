import { Trash2, AlertCircle, Folder, X } from 'lucide-react';

export interface ConfirmDialogData {
  isOpen: boolean;
  title: string;
  description: string;
  itemHighlight?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void | Promise<void>;
}

interface ConfirmDialogModalProps {
  dialog: ConfirmDialogData | null;
  onClose: () => void;
  isLight?: boolean;
}

export function ConfirmDialogModal({ dialog, onClose, isLight = false }: ConfirmDialogModalProps) {
  if (!dialog?.isOpen) return null;

  return (
    <div className={`fixed inset-0 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-150 ${
      isLight ? 'bg-slate-900/40' : 'bg-black/85'
    }`}>
      <div className={`rounded-3xl max-w-md w-full p-6 relative overflow-hidden animate-in zoom-in-95 duration-150 space-y-4 border ${
        isLight
          ? 'bg-gradient-to-b from-white via-slate-50 to-white border-red-200 shadow-[0_20px_50px_-15px_rgba(239,68,68,0.2)] text-slate-900'
          : 'bg-[#0c101a] border-red-500/30 text-slate-100 shadow-[0_0_60px_-10px_rgba(239,68,68,0.3)]'
      }`}>
        {/* Ambient accent glow bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent" />

        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 shadow-md ${
              isLight
                ? 'bg-red-50 border-red-200 text-red-600'
                : 'bg-red-500/15 border-red-500/30 text-red-400 shadow-red-950/40'
            }`}>
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-bold text-base tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {dialog.title}
              </h3>
              <p className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Konfirmasi Tindakan SQLite WAL
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition cursor-pointer ${
              isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
          {dialog.description}
        </p>

        {dialog.itemHighlight && (
          <div className={`rounded-2xl p-3 flex items-center gap-3 border ${
            isLight
              ? 'bg-slate-100/90 border-slate-200 text-slate-800'
              : 'bg-slate-950/80 border-slate-800/80 text-slate-200'
          }`}>
            <Folder className={`w-4 h-4 shrink-0 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
            <div className="truncate">
              <p className={`text-xs font-semibold truncate ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                {dialog.itemHighlight}
              </p>
              <p className={`text-[10px] font-mono truncate ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                Tersinkronisasi di SQLite WAL Engine
              </p>
            </div>
          </div>
        )}

        <div className={`flex items-center gap-2 text-[11px] px-3 py-2 rounded-xl border ${
          isLight
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-amber-500/10 border-amber-500/20 text-amber-400/90'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Tindakan ini bersifat permanen dan akan menghapus catatan di database lokal.</span>
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          <button
            onClick={onClose}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-xs transition cursor-pointer border ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            {dialog.cancelText || 'Batalkan'}
          </button>
          <button
            onClick={dialog.onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-500 hover:from-red-500 hover:to-rose-400 text-white font-bold text-xs shadow-lg shadow-red-500/25 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{dialog.confirmText || 'Konfirmasi Hapus'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
