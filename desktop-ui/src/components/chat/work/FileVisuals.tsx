import { baseName, diffBlocks, splitPath } from './workSummary';

/** Warna lencana ekstensi berkas (dipakai timeline, kartu perubahan, dan panel review). */
const EXT_TONE: Record<string, { dark: string; light: string }> = {
  tsx: { dark: 'text-sky-300 bg-sky-500/10', light: 'text-sky-700 bg-sky-50' },
  jsx: { dark: 'text-sky-300 bg-sky-500/10', light: 'text-sky-700 bg-sky-50' },
  ts: { dark: 'text-blue-300 bg-blue-500/10', light: 'text-blue-700 bg-blue-50' },
  js: { dark: 'text-amber-300 bg-amber-500/10', light: 'text-amber-700 bg-amber-50' },
  rs: { dark: 'text-orange-300 bg-orange-500/10', light: 'text-orange-700 bg-orange-50' },
  json: { dark: 'text-emerald-300 bg-emerald-500/10', light: 'text-emerald-700 bg-emerald-50' },
  toml: { dark: 'text-emerald-300 bg-emerald-500/10', light: 'text-emerald-700 bg-emerald-50' },
  yaml: { dark: 'text-emerald-300 bg-emerald-500/10', light: 'text-emerald-700 bg-emerald-50' },
  yml: { dark: 'text-emerald-300 bg-emerald-500/10', light: 'text-emerald-700 bg-emerald-50' },
  md: { dark: 'text-rose-300 bg-rose-500/10', light: 'text-rose-700 bg-rose-50' },
  css: { dark: 'text-purple-300 bg-purple-500/10', light: 'text-purple-700 bg-purple-50' },
  html: { dark: 'text-orange-300 bg-orange-500/10', light: 'text-orange-700 bg-orange-50' },
  py: { dark: 'text-yellow-300 bg-yellow-500/10', light: 'text-yellow-700 bg-yellow-50' },
  sql: { dark: 'text-teal-300 bg-teal-500/10', light: 'text-teal-700 bg-teal-50' },
};

function extOf(path: string): string {
  const name = baseName(path);
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
}

/** Lencana kecil ekstensi berkas, mis. "TSX". */
export function ExtBadge({ path, isLight }: { path: string; isLight: boolean }) {
  const ext = extOf(path);
  const tone = EXT_TONE[ext];
  return (
    <span
      className={`shrink-0 inline-grid place-items-center min-w-[30px] h-[17px] px-1 rounded text-[9px] font-bold uppercase tracking-wide font-mono ${
        tone ? (isLight ? tone.light : tone.dark) : isLight ? 'text-slate-500 bg-slate-100' : 'text-slate-400 bg-white/[0.05]'
      }`}
    >
      {ext ? ext.slice(0, 4) : 'file'}
    </span>
  );
}

/** Nama berkas tebal + folder redup; path lengkap di tooltip. */
export function FilePath({ path, isLight, showDir = true }: { path: string; isLight: boolean; showDir?: boolean }) {
  const { dir, name } = splitPath(path);
  return (
    <span title={path} className="flex items-baseline min-w-0 font-mono text-[11.5px]">
      {showDir && dir && <span className={`truncate shrink ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>{dir}</span>}
      <span className={`shrink-0 max-w-full truncate font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{name}</span>
    </span>
  );
}

/** "+12 −3" dengan bar 5 kotak ala GitHub. */
export function DiffStat({ additions, deletions, bar = true }: { additions: number; deletions: number; bar?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0 font-mono text-[11px] font-semibold tabular-nums">
      <span className="text-emerald-500">+{additions}</span>
      <span className="text-rose-500">−{deletions}</span>
      {bar && (
        <span className="hidden sm:inline-flex gap-[2px]" aria-hidden>
          {diffBlocks(additions, deletions).map((b, i) => (
            <span
              key={i}
              className={`w-[7px] h-[7px] rounded-[2px] ${b === 'add' ? 'bg-emerald-500' : b === 'del' ? 'bg-rose-500' : 'bg-slate-500/25'}`}
            />
          ))}
        </span>
      )}
    </span>
  );
}
