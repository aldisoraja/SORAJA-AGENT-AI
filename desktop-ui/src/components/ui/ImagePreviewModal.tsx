import { useEffect, useRef, useState } from 'react';
import { X, Download, Copy, Check, Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { copyImageToClipboard } from '../../utils/clipboard';

export interface PreviewImage {
  url: string;
  title: string;
}

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title?: string;
  isLight?: boolean;
  /** Seluruh gambar dalam kelompok yang sama — mengaktifkan navigasi sebelumnya/berikutnya (← / →). */
  gallery?: PreviewImage[];
  onNavigate?: (image: PreviewImage) => void;
}

export function ImagePreviewModal({
  isOpen,
  onClose,
  imageUrl,
  title = 'Pratinjau Gambar',
  isLight = false,
  gallery,
  onNavigate,
}: ImagePreviewModalProps) {
  const currentIndex = gallery ? gallery.findIndex((g) => g.url === imageUrl) : -1;
  const canNavigate = Boolean(onNavigate && gallery && gallery.length > 1 && currentIndex >= 0);

  // Berputar di ujung: setelah gambar terakhir kembali ke gambar pertama, dan sebaliknya.
  const step = (delta: number) => {
    if (!canNavigate || !gallery || !onNavigate) return;
    onNavigate(gallery[(currentIndex + delta + gallery.length) % gallery.length]);
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        stepRef.current(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  if (!isOpen || !imageUrl) return null;

  const handleCopy = async () => {
    const ok = await copyImageToClipboard(imageUrl);
    setCopyState(ok ? 'copied' : 'failed');
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState('idle'), 2000);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = title.endsWith('.png') || title.endsWith('.jpg') ? title : `${title}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 select-none backdrop-blur-md animate-in fade-in duration-150 ${
        isLight ? 'bg-slate-900/60' : 'bg-black/90'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`max-w-4xl max-h-[90vh] w-full rounded-3xl overflow-hidden flex flex-col shadow-2xl border animate-in zoom-in-95 duration-150 ${
          isLight
            ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-900/30'
            : 'bg-[#0d121f]/95 border-slate-800 text-slate-100 shadow-black/80'
        }`}
      >
        {/* Header Bar */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-800/80 bg-slate-950/60'
          }`}
        >
          <div className="flex items-center gap-2.5 truncate">
            <ImageIcon className={`w-4 h-4 shrink-0 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
            <h3 className={`font-semibold text-xs sm:text-sm truncate ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
              {title}
            </h3>
            {canNavigate && gallery && (
              <span
                className={`shrink-0 px-2 py-0.5 rounded-full text-[10.5px] font-mono ${
                  isLight ? 'bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {currentIndex + 1} / {gallery.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={`p-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold border ${
                isLight
                  ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200'
              }`}
              title="Salin gambar ke clipboard"
            >
              {copyState === 'copied' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copyState === 'copied' ? 'Tersalin' : 'Salin Gambar'}</span>
            </button>

            <button
              onClick={handleDownload}
              className={`p-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold border ${
                isLight
                  ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200'
              }`}
              title="Unduh Gambar"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Unduh</span>
            </button>

            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition cursor-pointer border ${
                isLight
                  ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-900'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Tutup (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image Content Canvas */}
        <div
          className={`relative flex-1 overflow-auto flex items-center justify-center p-4 sm:p-6 min-h-[300px] ${
            isLight ? 'bg-slate-100/60' : 'bg-[#080b12]'
          }`}
        >
          <img
            src={imageUrl}
            alt={title}
            onClick={handleCopy}
            title="Klik untuk menyalin gambar ke clipboard"
            className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-lg border border-black/10 select-none cursor-copy"
          />
          {canNavigate && (
            <button
              type="button"
              onClick={() => step(-1)}
              className={`absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full border shadow-lg transition cursor-pointer ${
                isLight
                  ? 'bg-white/90 hover:bg-white border-slate-200 text-slate-700'
                  : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-100'
              }`}
              title="Gambar sebelumnya (←)"
              aria-label="Gambar sebelumnya"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {canNavigate && (
            <button
              type="button"
              onClick={() => step(1)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full border shadow-lg transition cursor-pointer ${
                isLight
                  ? 'bg-white/90 hover:bg-white border-slate-200 text-slate-700'
                  : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-100'
              }`}
              title="Gambar berikutnya (→)"
              aria-label="Gambar berikutnya"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
          {copyState !== 'idle' && (
            <div
              role="status"
              className={`absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5 animate-in fade-in duration-150 ${
                copyState === 'copied' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
              }`}
            >
              {copyState === 'copied' ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Gambar tersalin ke clipboard
                </>
              ) : (
                'Gagal menyalin — izin clipboard ditolak. Gunakan tombol Unduh.'
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
