import { Image as ImageIcon, X, Plus, ZoomIn, FileSpreadsheet, FileText } from 'lucide-react';
import type { AttachedFile } from '../../types/database';

interface ChatAttachmentGalleryProps {
  attachments: AttachedFile[];
  maxImages: number;
  isProcessingImages: boolean;
  isLight: boolean;
  onOpenPreview: (url: string, title: string) => void;
  onRemoveAttachment: (id: string) => void;
  onRemoveAllImages: () => void;
  onAddMoreClick: () => void;
}

export function ChatAttachmentGallery({
  attachments,
  maxImages,
  isProcessingImages,
  isLight,
  onOpenPreview,
  onRemoveAttachment,
  onRemoveAllImages,
  onAddMoreClick,
}: ChatAttachmentGalleryProps) {
  const imageAttachments = attachments.filter((a) => a.type === 'image');
  const documentAttachments = attachments.filter((a) => a.type !== 'image');

  if (attachments.length === 0) return null;

  return (
    <div className="space-y-2 mb-2">
      {/* 1. Staged Image Gallery */}
      {imageAttachments.length > 0 && (
        <div
          className={`p-3 rounded-2xl border transition-all ${
            isLight
              ? 'bg-gradient-to-r from-blue-50/60 via-slate-50/70 to-indigo-50/40 border-slate-200/90 shadow-xs'
              : 'bg-slate-900/90 border-slate-800 shadow-inner'
          }`}
        >
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2">
              <ImageIcon className={`w-4 h-4 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
              <span className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                Lampiran Gambar
              </span>
              <span
                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border transition ${
                  imageAttachments.length >= maxImages
                    ? isLight
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                    : isLight
                    ? 'bg-blue-100/80 text-blue-800 border-blue-200'
                    : 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60'
                }`}
              >
                {imageAttachments.length} / {maxImages}
                {imageAttachments.length >= maxImages ? ' (Maksimal)' : ''}
              </span>
              {isProcessingImages && (
                <span className="text-[10px] text-blue-500 animate-pulse font-mono flex items-center gap-1">
                  Memproses...
                </span>
              )}
            </div>

            {imageAttachments.length > 1 && (
              <button
                type="button"
                onClick={onRemoveAllImages}
                className={`text-[11px] font-semibold transition cursor-pointer hover:underline ${
                  isLight ? 'text-slate-500 hover:text-red-600' : 'text-slate-400 hover:text-red-400'
                }`}
              >
                Hapus Semua Gambar
              </button>
            )}
          </div>

          {/* Thumbnail Scroll Strip */}
          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
            {imageAttachments.map((img, idx) => (
              <div
                key={img.id}
                onClick={() => onOpenPreview(img.previewUrl || '', img.name)}
                className={`relative group shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border shadow-xs transition-all hover:scale-[1.03] cursor-pointer ${
                  isLight
                    ? 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-md'
                    : 'bg-slate-950 border-slate-800 hover:border-cyan-500/80'
                }`}
              >
                <img src={img.previewUrl} alt={img.name} className="w-full h-full object-cover" />

                {/* Index badge */}
                <div className="absolute top-1 left-1 px-1.5 py-0.2 rounded-md bg-black/70 backdrop-blur-xs text-[9px] font-mono text-white font-bold select-none">
                  #{idx + 1}
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveAttachment(img.id);
                  }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/75 hover:bg-red-600 text-white flex items-center justify-center transition cursor-pointer shadow-sm"
                  title="Hapus gambar ini"
                >
                  <X className="w-3 h-3" />
                </button>

                {/* Hover overlay hint */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <ZoomIn className="w-4 h-4 text-white" />
                </div>

                {/* Size caption bar */}
                <div className="absolute inset-x-0 bottom-0 py-0.5 bg-gradient-to-t from-black/80 to-transparent text-[9px] font-mono text-white/90 text-center truncate px-1 pointer-events-none">
                  {img.size}
                </div>
              </div>
            ))}

            {/* Add More Button if slots available */}
            {imageAttachments.length < maxImages && (
              <button
                type="button"
                onClick={onAddMoreClick}
                className={`shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                  isLight
                    ? 'border-blue-300 hover:border-blue-500 bg-white/60 hover:bg-blue-50/70 text-blue-600'
                    : 'border-slate-700 hover:border-cyan-500 bg-slate-950/40 hover:bg-slate-900 text-slate-400 hover:text-cyan-300'
                }`}
                title={`Tambah gambar lagi (${maxImages - imageAttachments.length} slot tersisa)`}
              >
                <Plus className="w-4 h-4" />
                <span className="text-[10px] font-bold font-mono">
                  +{maxImages - imageAttachments.length}
                </span>
                <span className="text-[8px] opacity-75 hidden sm:inline">Paste / Klik</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. Non-Image Document Attachments */}
      {documentAttachments.length > 0 && (
        <div
          className={`flex flex-wrap gap-2 p-2 rounded-xl border ${
            isLight ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          {documentAttachments.map((att) => (
            <div
              key={att.id}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs shadow-2xs ${
                isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              {att.type === 'pdf' ? (
                <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-500 text-[9px] font-bold border border-red-500/30">
                  PDF
                </span>
              ) : att.type === 'word' ? (
                <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500 text-[9px] font-bold border border-blue-500/30">
                  DOC
                </span>
              ) : att.type === 'excel' ? (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 text-[9px] font-bold border border-emerald-500/30 flex items-center gap-1">
                  <FileSpreadsheet className="w-3 h-3" /> XLS
                </span>
              ) : (
                <FileText className={`w-4 h-4 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
              )}
              <div className="truncate max-w-[120px]">
                <p className={`truncate ${isLight ? 'text-slate-800 font-medium' : 'text-slate-200'}`}>{att.name}</p>
                <p className={`text-[9px] font-mono ${isLight ? 'text-slate-400' : 'text-slate-400'}`}>{att.size}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveAttachment(att.id)}
                className={`ml-1 cursor-pointer transition ${
                  isLight ? 'text-slate-400 hover:text-red-500' : 'text-slate-400 hover:text-red-400'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
