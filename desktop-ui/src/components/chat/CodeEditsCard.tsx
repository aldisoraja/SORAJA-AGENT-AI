import { Check, ChevronRight, FilePen } from 'lucide-react';
import type { CodeEditChunk } from '../../types/database';

interface CodeEditsCardProps {
  edits: CodeEditChunk[];
  isLight: boolean;
  onOpenDiffReview: (files: CodeEditChunk[], activeIndex?: number) => void;
  onAcceptAllEdits: () => void;
  onDismissEdits: () => void;
}

/** Ringkasan berkas yang diubah agen + tombol tinjau/terima/abaikan. */
export function CodeEditsCard({ edits, isLight, onOpenDiffReview, onAcceptAllEdits, onDismissEdits }: CodeEditsCardProps) {
  const add = edits.reduce((n, e) => n + e.additions, 0);
  const del = edits.reduce((n, e) => n + e.deletions, 0);

  return (
    <div className={`rounded-xl border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-white/[0.015] border-white/[0.07]'}`}>
      <div className={`flex items-center gap-2 px-3.5 py-2.5 border-b ${isLight ? 'border-slate-200' : 'border-white/[0.06]'}`}>
        <FilePen className="w-4 h-4 text-orange-400" />
        <span className={`text-[13px] font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
          {edits.length} berkas diubah
        </span>
        <span className="font-mono text-[11px] font-semibold">
          <span className="text-emerald-500">+{add}</span> <span className="text-rose-500">−{del}</span>
        </span>
      </div>

      <ul className="py-1">
        {edits.map((edit, idx) => (
          <li key={edit.file + idx}>
            <button
              type="button"
              onClick={() => onOpenDiffReview(edits, idx)}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-1.5 text-left font-mono text-[12px] cursor-pointer transition-colors group ${
                isLight ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-white/[0.03] text-slate-300'
              }`}
            >
              <span className="truncate" title={edit.file}>{edit.relativePath || edit.file}</span>
              <span className="flex items-center gap-2 shrink-0 text-[11px] font-semibold">
                <span className="text-emerald-500">+{edit.additions}</span>
                <span className="text-rose-500">−{edit.deletions}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className={`flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-t text-xs font-semibold ${isLight ? 'border-slate-200 bg-slate-50/60' : 'border-white/[0.06] bg-black/10'}`}>
        <button
          type="button"
          onClick={() => onOpenDiffReview(edits, 0)}
          className={`flex-1 min-w-[10rem] py-1.5 px-3 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
            isLight ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
          }`}
        >
          Tinjau semua perubahan
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onAcceptAllEdits}
          className={`py-1.5 px-3 rounded-lg transition cursor-pointer flex items-center gap-1 border ${
            isLight ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
          Terima
        </button>
        <button
          type="button"
          onClick={onDismissEdits}
          className={`py-1.5 px-3 rounded-lg transition cursor-pointer border ${
            isLight ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200' : 'bg-transparent hover:bg-white/[0.05] text-slate-300 border-white/[0.08]'
          }`}
        >
          Abaikan
        </button>
      </div>
    </div>
  );
}
