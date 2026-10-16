import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Layers, MessageSquareText, X } from 'lucide-react';
import type { CodeEditChunk } from '../../types/database';
import { CopyButton } from '../ui/CopyButton';
import { DiffStat, ExtBadge, FilePath } from '../chat/work/FileVisuals';
import { DiffCodeView } from './DiffCodeView';

interface DiffReviewPanelProps {
  activeDiffReview: {
    isOpen: boolean;
    files: CodeEditChunk[];
    activeFileIndex: number;
    turnPrompt?: string;
  };
  isLight?: boolean;
  onClose: () => void;
  onSelectFile: (index: number) => void;
}

/** Panel samping peninjauan perubahan kode agen (perubahan sudah diterapkan ke berkas kerja). */
export function DiffReviewPanel({ activeDiffReview, isLight = false, onClose, onSelectFile }: DiffReviewPanelProps) {
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const { files, activeFileIndex, turnPrompt } = activeDiffReview;
  const index = Math.min(Math.max(0, activeFileIndex), Math.max(0, files.length - 1));
  const current = files[index];

  // Alt+←/→ berpindah berkas (diabaikan saat mengetik).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight' && index < files.length - 1) onSelectFile(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) onSelectFile(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, files.length, onSelectFile]);

  if (!activeDiffReview.isOpen || !current) return null;

  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const iconBtn = `p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default ${
    isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
  }`;
  const path = current.relativePath || current.file;
  const totalAdd = files.reduce((n, f) => n + f.additions, 0);
  const totalDel = files.reduce((n, f) => n + f.deletions, 0);

  return (
    <aside
      className={`w-1/2 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200 border-l z-20 ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#080b13] border-white/[0.07] text-slate-200'
      }`}
      aria-label="Tinjau perubahan kode"
    >
      {/* Kepala panel */}
      <div className={`px-4 pt-3 pb-2.5 border-b space-y-2.5 ${isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-[#0b0f19] border-white/[0.06]'}`}>
        <div className="flex items-center gap-2">
          <span
            className={`w-7 h-7 rounded-lg grid place-items-center border shrink-0 ${
              isLight ? 'soraja-grad-soft border-blue-200 text-blue-700' : 'bg-cyan-500/10 border-cyan-500/25 text-cyan-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className={`text-[13px] font-semibold ${isLight ? 'text-slate-900' : 'text-slate-50'}`}>Tinjau Perubahan</div>
            <div className={`flex items-center gap-2 text-[11px] ${muted}`}>
              <span>{files.length} berkas</span>
              <DiffStat additions={totalAdd} deletions={totalDel} bar={false} />
            </div>
          </div>
          {files.length > 1 && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button type="button" className={iconBtn} disabled={index === 0} onClick={() => onSelectFile(index - 1)} title="Berkas sebelumnya (Alt+←)">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className={`text-[11px] font-mono tabular-nums px-1 ${muted}`}>
                {index + 1}/{files.length}
              </span>
              <button
                type="button"
                className={iconBtn}
                disabled={index === files.length - 1}
                onClick={() => onSelectFile(index + 1)}
                title="Berkas berikutnya (Alt+→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          <button type="button" onClick={onClose} className={iconBtn} title="Tutup panel">
            <X className="w-4 h-4" />
          </button>
        </div>

        {turnPrompt?.trim() && (
          <div
            title={turnPrompt}
            className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-[11.5px] border ${
              isLight ? 'bg-white border-slate-200 text-slate-600' : 'bg-white/[0.02] border-white/[0.06] text-slate-400'
            }`}
          >
            <MessageSquareText className={`w-3.5 h-3.5 mt-px shrink-0 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
            <span className="min-w-0">
              <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Permintaan: </span>
              <span className="line-clamp-2 inline">{turnPrompt}</span>
            </span>
          </div>
        )}
      </div>

      {/* Pemilih berkas + status */}
      <div className={`px-3 py-2 border-b flex items-center gap-2 relative ${isLight ? 'border-slate-200' : 'border-white/[0.06]'}`}>
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => files.length > 1 && setIsFileMenuOpen((v) => !v)}
            aria-expanded={isFileMenuOpen}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${files.length > 1 ? 'cursor-pointer' : 'cursor-default'} ${
              isLight ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-white/[0.02] border-white/[0.08] hover:border-white/[0.14]'
            }`}
          >
            <ExtBadge path={current.file} isLight={isLight} />
            <span className="min-w-0 flex-1">
              <FilePath path={path} isLight={isLight} />
            </span>
            <DiffStat additions={current.additions} deletions={current.deletions} />
            {files.length > 1 && <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${muted} ${isFileMenuOpen ? 'rotate-180' : ''}`} />}
          </button>

          {isFileMenuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setIsFileMenuOpen(false)} />
              <div
                className={`absolute top-full left-0 right-0 mt-1 max-h-80 overflow-y-auto rounded-xl shadow-2xl p-1 z-30 border ${
                  isLight ? 'bg-white border-slate-200' : 'bg-[#0f1420] border-white/[0.08]'
                }`}
              >
                {files.map((file, i) => (
                  <button
                    key={file.file + i}
                    type="button"
                    onClick={() => {
                      onSelectFile(i);
                      setIsFileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                      i === index
                        ? isLight ? 'soraja-grad-soft' : 'bg-cyan-500/10'
                        : isLight ? 'hover:bg-slate-100' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <ExtBadge path={file.file} isLight={isLight} />
                    <span className="min-w-0 flex-1">
                      <FilePath path={file.relativePath || file.file} isLight={isLight} />
                    </span>
                    <DiffStat additions={file.additions} deletions={file.deletions} bar={false} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <CopyButton text={path} label="Salin path" isLight={isLight} className="shrink-0" />
      </div>

      {/* Isi diff */}
      <div className="flex-1 overflow-y-auto select-text scrollbar-thin">
        <DiffCodeView chunk={current} isLight={isLight} />
      </div>

      {/* Kaki panel */}
      <div
        className={`px-4 py-2 border-t text-[11px] flex items-center justify-between gap-2 ${
          isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-[#0b0f19] border-white/[0.06] text-slate-400'
        }`}
      >
        <span className="font-mono tabular-nums">
          <span className="text-emerald-500 font-semibold">+{current.additions}</span> ditambah ·{' '}
          <span className="text-rose-500 font-semibold">−{current.deletions}</span> dihapus
        </span>
        <span className={`inline-flex items-center gap-1 font-medium ${isLight ? 'text-emerald-700' : 'text-emerald-400/90'}`}>
          <Check className="w-3.5 h-3.5" />
          Sudah diterapkan ke berkas kerja
        </span>
      </div>
    </aside>
  );
}
