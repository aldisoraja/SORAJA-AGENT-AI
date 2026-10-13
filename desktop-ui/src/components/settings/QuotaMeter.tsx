interface QuotaMeterProps {
  isLight: boolean;
  title: string;
  /** Sisa kuota (persen). undefined = CLI tidak melaporkan jendela ini. */
  remainingPercent?: number;
  /** Teks sisa waktu reset, mis. "2 hari, 4 jam" atau "Siap direset". */
  resetText?: string;
}

/** Warna berdasarkan sisa kuota: hijau > 50%, kuning 20–50%, merah < 20%. */
export function quotaTone(remaining: number) {
  if (remaining > 50) return { bar: 'bg-emerald-500', text: 'text-emerald-500', label: 'Aman' };
  if (remaining >= 20) return { bar: 'bg-amber-500', text: 'text-amber-500', label: 'Mulai menipis' };
  return { bar: 'bg-rose-500', text: 'text-rose-500', label: 'Hampir habis' };
}

/** Satu meter sisa kuota. Tidak menampilkan angka bila CLI tidak menyediakan data. */
export function QuotaMeter({ isLight, title, remainingPercent, resetText }: QuotaMeterProps) {
  const known = typeof remainingPercent === 'number';
  const pct = known ? Math.max(0, Math.min(100, Math.round(remainingPercent))) : 0;
  const tone = quotaTone(pct);
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';

  return (
    <div className={`p-3 rounded-xl border space-y-2 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{title}</span>
        <span className={`text-sm font-bold font-mono ${known ? tone.text : muted}`}>{known ? `${pct}%` : '—'}</span>
      </div>
      <div className={`h-2 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`}>
        <div className={`h-full rounded-full transition-all duration-500 ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-[11px] ${muted}`}>
        {!known
          ? 'Tidak dilaporkan oleh CLI'
          : pct >= 100
          ? 'Kuota penuh'
          : `${tone.label} · ${resetText === 'Siap direset' ? 'siap direset' : `reset dalam ${resetText || '—'}`}`}
      </p>
    </div>
  );
}
