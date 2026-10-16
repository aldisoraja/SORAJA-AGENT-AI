import { CheckCircle2, ChevronRight, FilePen, FilePlus2 } from 'lucide-react';
import type { CodeEditChunk } from '../../types/database';
import { DiffStat, ExtBadge, FilePath } from './work/FileVisuals';

interface CodeEditsCardProps {
  edits: CodeEditChunk[];
  isLight: boolean;
  onOpenDiffReview: (files: CodeEditChunk[], activeIndex?: number) => void;
}

/** Berkas baru = semua baris tambahan tanpa konteks/hapus (lihat `wholeFileAdded`). */
const isNewFile = (e: CodeEditChunk) => e.deletions === 0 && e.diffLines.every((l) => l.type === 'added');

/**
 * Ringkasan berkas yang diubah agen. Perubahan sudah ditulis langsung ke berkas kerja (auto-apply),
 * jadi kartu ini menampilkan status; klik baris berkas untuk meninjau diff-nya.
 */
export function CodeEditsCard({ edits, isLight, onOpenDiffReview }: CodeEditsCardProps) {
  const add = edits.reduce((n, e) => n + e.additions, 0);
  const del = edits.reduce((n, e) => n + e.deletions, 0);
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';

  return (
    <div className={`rounded-2xl border overflow-hidden ${isLight ? 'bg-white border-slate-200 shadow-sm shadow-slate-200/60' : 'bg-white/[0.015] border-white/[0.07]'}`}>
      <div className={`flex items-center gap-3 px-3 py-2.5 border-b ${isLight ? 'border-slate-100' : 'border-white/[0.05]'}`}>
        <span
          className={`shrink-0 w-8 h-8 rounded-xl grid place-items-center border ${
            isLight ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-orange-500/10 border-orange-500/20 text-orange-300'
          }`}
        >
          <FilePen className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[13px] font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
              {edits.length} berkas diubah
            </span>
            <DiffStat additions={add} deletions={del} />
          </div>
          <div className={`flex items-center gap-1 text-[11px] mt-0.5 ${isLight ? 'text-emerald-700' : 'text-emerald-400/90'}`}>
            <CheckCircle2 className="w-3 h-3" />
            <span>Sudah diterapkan ke berkas kerja</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenDiffReview(edits, 0)}
          className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold border cursor-pointer transition-colors ${
            isLight
              ? 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
              : 'border-white/[0.08] text-slate-200 hover:bg-white/[0.05] hover:border-white/[0.14]'
          }`}
        >
          Tinjau semua
        </button>
      </div>

      <ul className="py-1">
        {edits.map((edit, idx) => (
          <li key={edit.file + idx}>
            <button
              type="button"
              onClick={() => onOpenDiffReview(edits, idx)}
              title={`Tinjau perubahan: ${edit.relativePath || edit.file}`}
              className={`group w-full flex items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer transition-colors ${
                isLight ? 'hover:bg-slate-50' : 'hover:bg-white/[0.03]'
              }`}
            >
              <ExtBadge path={edit.file} isLight={isLight} />
              <span className="min-w-0 flex-1">
                <FilePath path={edit.relativePath || edit.file} isLight={isLight} />
              </span>
              {isNewFile(edit) && (
                <span
                  className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-px rounded text-[9.5px] font-semibold ${
                    isLight ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-500/10 text-emerald-300'
                  }`}
                >
                  <FilePlus2 className="w-3 h-3" /> baru
                </span>
              )}
              <DiffStat additions={edit.additions} deletions={edit.deletions} />
              <ChevronRight className={`w-3.5 h-3.5 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity ${muted}`} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
