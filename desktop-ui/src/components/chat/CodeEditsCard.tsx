import { CheckCircle2, ChevronRight, FilePen } from 'lucide-react';
import type { CodeEditChunk } from '../../types/database';

interface CodeEditsCardProps {
  edits: CodeEditChunk[];
  isLight: boolean;
  onOpenDiffReview: (files: CodeEditChunk[], activeIndex?: number) => void;
}

/**
 * Ringkasan berkas yang diubah agen. Perubahan sudah ditulis langsung ke berkas kerja (auto-apply),
 * jadi kartu ini hanya menampilkan status; klik baris berkas untuk melihat diff-nya (opsional).
 */
export function CodeEditsCard({ edits, isLight, onOpenDiffReview }: CodeEditsCardProps) {
  const add = edits.reduce((n, e) => n + e.additions, 0);
  const del = edits.reduce((n, e) => n + e.deletions, 0);

  return (
    <div className={`rounded-xl border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-white/[0.015] border-white/[0.07]'}`}>
      <div className={`flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-b ${isLight ? 'border-slate-200' : 'border-white/[0.06]'}`}>
        <FilePen className="w-4 h-4 text-orange-400" />
        <span className={`text-[13px] font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
          {edits.length} berkas diubah
        </span>
        <span className="font-mono text-[11px] font-semibold">
          <span className="text-emerald-500">+{add}</span> <span className="text-rose-500">−{del}</span>
        </span>
        <span
          className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
            isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
          }`}
          title="Perubahan sudah ditulis langsung ke berkas proyek"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Diterapkan ke berkas kerja
        </span>
      </div>

      <ul className="py-1">
        {edits.map((edit, idx) => (
          <li key={edit.file + idx}>
            <button
              type="button"
              onClick={() => onOpenDiffReview(edits, idx)}
              title={`Lihat perbedaan kode: ${edit.relativePath || edit.file}`}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-1.5 text-left font-mono text-[12px] cursor-pointer transition-colors group ${
                isLight ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-white/[0.03] text-slate-300'
              }`}
            >
              <span className="truncate">{edit.relativePath || edit.file}</span>
              <span className="flex items-center gap-2 shrink-0 text-[11px] font-semibold">
                <span className="text-emerald-500">+{edit.additions}</span>
                <span className="text-rose-500">−{edit.deletions}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
