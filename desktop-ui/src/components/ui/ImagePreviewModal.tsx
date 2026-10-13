import { useEffect } from 'react';
import { X, Download, Image as ImageIcon } from 'lucide-react';

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title?: string;
  isLight?: boolean;
}

export function ImagePreviewModal({
  isOpen,
  onClose,
  imageUrl,
  title = 'Pratinjau Gambar',
  isLight = false,
}: ImagePreviewModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

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
          </div>

          <div className="flex items-center gap-2">
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
          className={`flex-1 overflow-auto flex items-center justify-center p-4 sm:p-6 min-h-[300px] ${
            isLight ? 'bg-slate-100/60' : 'bg-[#080b12]'
          }`}
        >
          <img
            src={imageUrl}
            alt={title}
            className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-lg border border-black/10 select-none"
          />
        </div>
      </div>
    </div>
  );
}
