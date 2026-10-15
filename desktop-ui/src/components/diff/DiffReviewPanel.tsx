import { useState } from 'react';
import {
  Check,
  X,
  ChevronDown,
  Sparkles,
  Layers,
} from 'lucide-react';
import type { CodeEditChunk } from '../../types/database';

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

export function DiffReviewPanel({
  activeDiffReview,
  isLight = false,
  onClose,
  onSelectFile,
}: DiffReviewPanelProps) {
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [dismissTurnPrompt, setDismissTurnPrompt] = useState(false);
  const [expandedCollapsedSections, setExpandedCollapsedSections] = useState<Record<number, boolean>>({});

  if (!activeDiffReview.isOpen || activeDiffReview.files.length === 0) return null;

  const currentEdit = activeDiffReview.files[activeDiffReview.activeFileIndex] || activeDiffReview.files[0];
  const ext = currentEdit.file.split('.').pop()?.toLowerCase() || '';

  const getLanguageIcon = (extension: string) => {
    if (extension === 'tsx' || extension === 'jsx') {
      return { icon: '⚛', name: 'React TSX', color: isLight ? 'text-sky-600' : 'text-cyan-400' };
    }
    if (extension === 'ts') {
      return { icon: 'TS', name: 'TypeScript', color: isLight ? 'text-blue-600' : 'text-blue-400' };
    }
    if (extension === 'rs') {
      return { icon: '🦀', name: 'Rust', color: isLight ? 'text-orange-600' : 'text-orange-400' };
    }
    if (extension === 'json') {
      return { icon: '{ }', name: 'JSON', color: isLight ? 'text-emerald-600' : 'text-emerald-400' };
    }
    return { icon: '📄', name: extension.toUpperCase(), color: isLight ? 'text-slate-600' : 'text-slate-400' };
  };

  const langInfo = getLanguageIcon(ext);
  const turnText = activeDiffReview.turnPrompt || 'Perubahan kode otonom oleh agen AI';

  return (
    <div
      className={`w-1/2 flex flex-col h-full overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200 border-l z-20 ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#080b13] border-slate-800/90 text-slate-200'
      }`}
    >
      {/* 1. Header: Tab Review & For Turn Chip (Ref: media_1791276997336.png) */}
      <div
        className={`px-4 pt-3 pb-2 border-b flex flex-col gap-2 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0b0e18] border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between">
          {/* Review Tab Item */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 pb-1 border-b-2 border-blue-500 font-semibold text-xs text-blue-600 dark:text-cyan-400">
              <Layers className="w-3.5 h-3.5" />
              <span>Review</span>
            </div>
            <span className={`text-[11px] ${isLight ? 'text-slate-400' : 'text-slate-600'}`}>
              ({activeDiffReview.files.length} berkas)
            </span>
          </div>

          {/* Close Panel Button */}
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition cursor-pointer ${
              isLight
                ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-200/70'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Tutup Panel Review"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Turn Prompt Context Chip */}
        {!dismissTurnPrompt && (
          <div
            className={`flex items-center justify-between px-2.5 py-1 rounded-lg text-xs font-mono border ${
              isLight
                ? 'soraja-grad-soft border-blue-200 text-blue-900'
                : 'bg-cyan-950/30 border-cyan-800/40 text-cyan-300'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
              <span className="font-bold shrink-0">For Turn:</span>
              <span className="truncate opacity-90">{turnText}</span>
            </div>
            <button
              onClick={() => setDismissTurnPrompt(true)}
              className="p-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded cursor-pointer shrink-0 ml-1.5"
              title="Tutup konteks turn"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* 2. Secondary Sub-Bar: File Switcher Dropdown & Action Buttons */}
      <div
        className={`px-3 py-2 border-b flex items-center justify-between gap-2 relative ${
          isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-[#0d111c] border-slate-800/80'
        }`}
      >
        {/* File Dropdown Selector */}
        <div className="relative">
          <button
            onClick={() => setIsFileMenuOpen((prev) => !prev)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-mono font-medium transition cursor-pointer ${
              isLight
                ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800 shadow-2xs'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700/80 text-slate-200 shadow-inner'
            }`}
          >
            <span className={`text-[11px] font-bold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Edited</span>
            <span className={`font-bold ${langInfo.color}`}>{langInfo.icon}</span>
            <span className="font-semibold truncate max-w-[200px] sm:max-w-[260px]">
              {currentEdit.relativePath || currentEdit.file}
            </span>
            <span className="text-emerald-500 font-bold text-[10px]">+{currentEdit.additions}</span>
            <span className="text-rose-500 font-bold text-[10px]">-{currentEdit.deletions}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isFileMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* File Switcher Dropdown Menu */}
          {isFileMenuOpen && activeDiffReview.files.length > 1 && (
            <div
              className={`absolute top-full left-0 mt-1 w-80 rounded-xl shadow-2xl p-1.5 z-30 border ${
                isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
              }`}
            >
              <div className="text-[10px] font-bold px-2 py-1 uppercase tracking-wider text-slate-400">
                Pilih Berkas yang Dimodifikasi ({activeDiffReview.files.length})
              </div>
              {activeDiffReview.files.map((file, idx) => {
                const fExt = file.file.split('.').pop()?.toLowerCase() || '';
                const fLang = getLanguageIcon(fExt);
                const isSelected = activeDiffReview.activeFileIndex === idx;
                return (
                  <button
                    key={file.file + idx}
                    onClick={() => {
                      onSelectFile(idx);
                      setIsFileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer text-left ${
                      isSelected
                        ? isLight
                          ? 'soraja-grad-soft text-blue-800 font-bold'
                          : 'bg-cyan-950/60 text-cyan-300 font-bold'
                        : isLight
                        ? 'hover:bg-slate-100 text-slate-700'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className={fLang.color}>{fLang.icon}</span>
                      <span className="truncate">{file.file}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-bold">
                      <span className="text-emerald-500">+{file.additions}</span>
                      <span className="text-rose-500">-{file.deletions}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Status: perubahan sudah diterapkan otomatis ke berkas kerja */}
        <span
          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl border shrink-0 ${
            isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
          }`}
          title="Perubahan ini sudah ditulis langsung ke berkas proyek"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Sudah diterapkan</span>
        </span>
      </div>

      {/* 3. Code Diff Lines Area (Ref: media_1791276997336.png with Line numbers & Gutter badges) */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-xs select-text scrollbar-thin">
        {currentEdit.diffLines.map((line, lIdx) => {
          if (line.type === 'collapsed') {
            const isExpanded = expandedCollapsedSections[lIdx] ?? false;
            return (
              <div
                key={lIdx}
                onClick={() =>
                  setExpandedCollapsedSections((prev) => ({
                    ...prev,
                    [lIdx]: !prev[lIdx],
                  }))
                }
                className={`my-2 py-1.5 px-4 rounded-xl text-center text-[11px] flex items-center justify-center gap-2 select-none border cursor-pointer transition ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-600'
                    : 'bg-slate-900/60 hover:bg-slate-800 border-slate-800/80 text-slate-400'
                }`}
                title="Klik untuk membuka / menutup baris tersembunyi"
              >
                <span>...</span>
                <span>
                  {isExpanded ? 'Tutup baris konteks' : `+${line.collapsedCount || 591} baris konteks tersembunyi`}
                </span>
                <span>...</span>
              </div>
            );
          }

          const isDeleted = line.type === 'deleted';
          const isAdded = line.type === 'added';

          return (
            <div
              key={lIdx}
              className={`flex items-center py-0.5 px-1.5 rounded-md font-mono text-[12px] leading-5 transition-colors ${
                isDeleted
                  ? isLight
                    ? 'bg-rose-50/80 text-rose-900 border-l-2 border-rose-500'
                    : 'bg-rose-950/30 text-rose-300 border-l-2 border-rose-500'
                  : isAdded
                  ? isLight
                    ? 'bg-emerald-50/80 text-emerald-900 border-l-2 border-emerald-500'
                    : 'bg-emerald-950/30 text-emerald-300 border-l-2 border-emerald-500'
                  : isLight
                  ? 'text-slate-600 hover:bg-slate-100/50'
                  : 'text-slate-400 hover:bg-slate-900/40'
              }`}
            >
              {/* Old Line Number */}
              <span
                className={`w-9 shrink-0 text-right pr-2 select-none font-mono text-[10px] ${
                  isDeleted
                    ? isLight
                      ? 'text-rose-500 font-bold'
                      : 'text-rose-400/80 font-bold'
                    : isLight
                    ? 'text-slate-400'
                    : 'text-slate-600'
                }`}
              >
                {line.oldLineNo ?? ''}
              </span>

              {/* New Line Number */}
              <span
                className={`w-9 shrink-0 text-right pr-2 select-none font-mono text-[10px] ${
                  isAdded
                    ? isLight
                      ? 'text-emerald-600 font-bold'
                      : 'text-emerald-400/80 font-bold'
                    : isLight
                    ? 'text-slate-400'
                    : 'text-slate-600'
                }`}
              >
                {line.newLineNo ?? ''}
              </span>

              {/* Gutter Badge: '+' or '-' indicator with rounded pill styling */}
              <span className="w-5 shrink-0 flex items-center justify-center select-none">
                {isAdded && (
                  <span className="w-3.5 h-3.5 rounded bg-emerald-500/20 text-emerald-500 text-[11px] font-bold flex items-center justify-center">
                    +
                  </span>
                )}
                {isDeleted && (
                  <span className="w-3.5 h-3.5 rounded bg-rose-500/20 text-rose-500 text-[11px] font-bold flex items-center justify-center">
                    -
                  </span>
                )}
              </span>

              {/* Code Line Content */}
              <pre className="flex-1 font-mono text-[12px] whitespace-pre-wrap break-all pl-1.5">
                {line.text}
              </pre>
            </div>
          );
        })}
      </div>

      {/* 4. Footer Summary Strip */}
      <div
        className={`px-4 py-2 border-t text-[11px] font-mono flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-[#090c15] border-slate-800 text-slate-400'
        }`}
      >
        <div className="flex items-center gap-2">
          <span>{currentEdit.relativePath || currentEdit.file}</span>
          <span>•</span>
          <span className="text-emerald-500 font-bold">+{currentEdit.additions} baru</span>
          <span>•</span>
          <span className="text-rose-500 font-bold">-{currentEdit.deletions} dihapus</span>
        </div>
        <span className="text-slate-500 hidden sm:inline">Diterapkan otomatis</span>
      </div>
    </div>
  );
}
