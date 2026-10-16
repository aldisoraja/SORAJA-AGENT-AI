import { Circle, CircleCheck, CircleDot, ExternalLink } from 'lucide-react';
import type { CodeEditChunk, PlanItem } from '../../../types/database';
import { CopyButton } from '../../ui/CopyButton';
import { diffPreview } from './workSummary';

/** Blok keluaran ala terminal: baris perintah `$ …` + keluaran, dengan tombol salin. */
export function OutputBlock({
  command,
  output,
  isLight,
  failed,
}: {
  command?: string;
  output: string;
  isLight: boolean;
  failed?: boolean;
}) {
  return (
    <div className={`rounded-lg border overflow-hidden ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#070a11] border-white/[0.06]'}`}>
      <div
        className={`flex items-center gap-2 pl-3 pr-1 py-1 border-b text-[10.5px] ${
          isLight ? 'border-slate-200 text-slate-500 bg-white' : 'border-white/[0.05] text-slate-500 bg-white/[0.02]'
        }`}
      >
        <span className={`font-semibold uppercase tracking-[0.12em] ${failed ? 'text-rose-500' : ''}`}>
          {command ? (failed ? 'Keluaran · gagal' : 'Keluaran') : 'Hasil'}
        </span>
        <span className="flex-1" />
        <CopyButton text={output} label="Salin" isLight={isLight} className="!py-0.5" />
      </div>
      <pre
        className={`max-h-64 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all ${
          isLight ? 'text-slate-700' : 'text-slate-300'
        }`}
      >
        {command && <span className={isLight ? 'text-emerald-700' : 'text-emerald-400'}>$ {command}{'\n'}</span>}
        {output}
      </pre>
    </div>
  );
}

/** Cuplikan diff ringkas di dalam timeline + tombol membuka panel review penuh. */
export function DiffPreview({ chunk, isLight, onOpen }: { chunk: CodeEditChunk; isLight: boolean; onOpen?: () => void }) {
  const { lines, hidden } = diffPreview(chunk);
  return (
    <div className={`rounded-lg border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-[#070a11] border-white/[0.06]'}`}>
      <div className="overflow-x-auto py-1 font-mono text-[11px] leading-[18px]">
        {lines.map((l, i) => {
          const add = l.type === 'added';
          const del = l.type === 'deleted';
          return (
            <div
              key={i}
              className={`flex min-w-max ${
                add ? (isLight ? 'bg-emerald-50 text-emerald-900' : 'bg-emerald-500/[0.08] text-emerald-200')
                : del ? (isLight ? 'bg-rose-50 text-rose-900' : 'bg-rose-500/[0.08] text-rose-200')
                : isLight ? 'text-slate-500' : 'text-slate-500'
              }`}
            >
              <span className={`w-10 shrink-0 text-right pr-2 select-none ${isLight ? 'text-slate-400' : 'text-slate-600'}`}>
                {l.newLineNo ?? l.oldLineNo ?? ''}
              </span>
              <span className={`w-4 shrink-0 select-none ${add ? 'text-emerald-500' : del ? 'text-rose-500' : ''}`}>
                {add ? '+' : del ? '−' : ''}
              </span>
              <span className="pr-3 whitespace-pre">{l.text || ' '}</span>
            </div>
          );
        })}
      </div>
      {(hidden > 0 || onOpen) && (
        <div
          className={`flex items-center justify-between gap-2 px-3 py-1.5 border-t text-[10.5px] ${
            isLight ? 'border-slate-200 text-slate-500 bg-slate-50' : 'border-white/[0.05] text-slate-500 bg-white/[0.02]'
          }`}
        >
          <span>{hidden > 0 ? `${hidden} baris perubahan lain tidak ditampilkan` : 'Cuplikan perubahan'}</span>
          {onOpen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className={`inline-flex items-center gap-1 font-semibold cursor-pointer ${isLight ? 'text-blue-600 hover:text-blue-800' : 'text-cyan-300 hover:text-cyan-200'}`}
            >
              Buka di panel review <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Daftar rencana kerja agen dengan status tiap butir. */
export function PlanList({ todos, isLight }: { todos: PlanItem[]; isLight: boolean }) {
  return (
    <ul className={`rounded-lg border px-3 py-2 space-y-1 ${isLight ? 'bg-white border-slate-200' : 'bg-white/[0.02] border-white/[0.06]'}`}>
      {todos.map((t, i) => (
        <li key={i} className="flex items-start gap-2 text-[12px] leading-5">
          {t.status === 'done' ? (
            <CircleCheck className="w-3.5 h-3.5 mt-[3px] shrink-0 text-emerald-500" />
          ) : t.status === 'active' ? (
            <CircleDot className={`w-3.5 h-3.5 mt-[3px] shrink-0 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
          ) : (
            <Circle className={`w-3.5 h-3.5 mt-[3px] shrink-0 ${isLight ? 'text-slate-300' : 'text-slate-600'}`} />
          )}
          <span
            className={
              t.status === 'done'
                ? `line-through ${isLight ? 'text-slate-400' : 'text-slate-500'}`
                : t.status === 'active'
                  ? `font-medium ${isLight ? 'text-slate-900' : 'text-slate-100'}`
                  : isLight ? 'text-slate-600' : 'text-slate-400'
            }
          >
            {t.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
