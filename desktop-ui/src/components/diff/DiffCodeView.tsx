import type { CodeEditChunk } from '../../types/database';

/**
 * Isi diff satu berkas: nomor baris lama/baru, tanda +/−, dan pemisah bagian yang tidak berubah.
 * Baris yang tidak berubah di luar hunk tidak dimuat (hanya jumlahnya dari `git diff`).
 */
export function DiffCodeView({ chunk, isLight }: { chunk: CodeEditChunk; isLight: boolean }) {
  const gutter = isLight ? 'text-slate-400' : 'text-slate-600';
  return (
    <div className="font-mono text-[12px] leading-[20px] py-2">
      {chunk.diffLines.map((line, i) => {
        if (line.type === 'collapsed') {
          return (
            <div
              key={i}
              className={`my-1.5 mx-2 flex items-center gap-3 select-none text-[10.5px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}
            >
              <span className={`flex-1 border-t border-dashed ${isLight ? 'border-slate-200' : 'border-white/[0.08]'}`} />
              <span>
                ⋯ {line.collapsedCount ? `${line.collapsedCount} baris tidak berubah` : 'baris tidak berubah'}
              </span>
              <span className={`flex-1 border-t border-dashed ${isLight ? 'border-slate-200' : 'border-white/[0.08]'}`} />
            </div>
          );
        }
        const add = line.type === 'added';
        const del = line.type === 'deleted';
        return (
          <div
            key={i}
            className={`flex ${
              add
                ? isLight ? 'bg-emerald-50 text-emerald-950' : 'bg-emerald-500/[0.09] text-emerald-100'
                : del
                  ? isLight ? 'bg-rose-50 text-rose-950' : 'bg-rose-500/[0.09] text-rose-100'
                  : isLight ? 'text-slate-600' : 'text-slate-400'
            }`}
          >
            <span
              className={`w-11 shrink-0 text-right pr-2 select-none text-[10.5px] border-l-2 ${
                add ? 'border-emerald-500' : del ? 'border-rose-500' : 'border-transparent'
              } ${del ? (isLight ? 'text-rose-500' : 'text-rose-400/80') : gutter}`}
            >
              {line.oldLineNo ?? ''}
            </span>
            <span className={`w-11 shrink-0 text-right pr-2 select-none text-[10.5px] ${add ? (isLight ? 'text-emerald-600' : 'text-emerald-400/80') : gutter}`}>
              {line.newLineNo ?? ''}
            </span>
            <span
              className={`w-5 shrink-0 text-center select-none font-semibold ${add ? 'text-emerald-500' : del ? 'text-rose-500' : ''}`}
            >
              {add ? '+' : del ? '−' : ''}
            </span>
            <span className="flex-1 min-w-0 pr-4 whitespace-pre-wrap break-all">{line.text || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}
