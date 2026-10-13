import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '../../utils/clipboard';

interface CopyButtonProps {
  /** Teks yang disalin; fungsi dievaluasi saat diklik (konten streaming selalu terbaru). */
  text: string | (() => string);
  label?: string;
  isLight?: boolean;
  /** `ghost` = tombol kecil di bilah aksi pesan; `onDark` = di atas bubble berwarna. */
  variant?: 'ghost' | 'onDark';
  className?: string;
}

/** Tombol salin dengan umpan balik "Tersalin" selama 1,8 detik. */
export function CopyButton({ text, label = 'Salin', isLight = false, variant = 'ghost', className = '' }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 1800);
    return () => clearTimeout(t);
  }, [state]);

  const tone =
    variant === 'onDark'
      ? 'text-white/80 hover:text-white hover:bg-white/15'
      : isLight
        ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70'
        : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]';

  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyText(typeof text === 'function' ? text() : text);
        setState(ok ? 'ok' : 'fail');
      }}
      title={state === 'ok' ? 'Tersalin ke clipboard' : `${label} ke clipboard`}
      aria-label={label}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${tone} ${className}`}
    >
      {state === 'ok' ? (
        <Check className="w-3.5 h-3.5 text-emerald-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
      <span>{state === 'ok' ? 'Tersalin' : state === 'fail' ? 'Gagal menyalin' : label}</span>
    </button>
  );
}
