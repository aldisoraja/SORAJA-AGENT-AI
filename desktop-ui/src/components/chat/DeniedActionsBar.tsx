import { ShieldCheck, SquareTerminal } from 'lucide-react';

interface DeniedActionsBarProps {
  actions: string[];
  agentName: string;
  /** Claude diberi izin persis per tool; CLI lain berjalan dengan izin penuh selama satu giliran. */
  preciseGrant: boolean;
  isLight: boolean;
  onRetry: () => void;
  onOpenInTerminal?: () => void;
}

/** Aksi pesan terakhir yang ditolak mode aman: izinkan & ulangi di Chat GUI, atau lanjutkan di Terminal. */
export function DeniedActionsBar({ actions, agentName, preciseGrant, isLight, onRetry, onOpenInTerminal }: DeniedActionsBarProps) {
  const shown = actions.slice(0, 3).join(', ') + (actions.length > 3 ? `, +${actions.length - 3}` : '');
  const hint = preciseGrant
    ? `${agentName} hanya diizinkan menjalankan ${shown} pada giliran berikutnya.`
    : `${agentName} tidak mendukung izin per aksi: semua aksi diizinkan selama satu giliran berikutnya saja.`;
  const secondary = isLight
    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
    : 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:bg-white/[0.06]';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onRetry}
        title={hint}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
          isLight ? 'soraja-grad-primary text-white' : 'bg-amber-500/15 border border-amber-400/40 text-amber-200 hover:bg-amber-500/25'
        }`}
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        Izinkan & ulangi
      </button>
      {onOpenInTerminal && (
        <button
          type="button"
          onClick={onOpenInTerminal}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${secondary}`}
        >
          <SquareTerminal className="w-3.5 h-3.5" />
          Buka di Terminal
        </button>
      )}
      <span className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{hint}</span>
    </div>
  );
}
