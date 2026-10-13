import { Check, FileSpreadsheet, FileText, ZoomIn } from 'lucide-react';
import type { MessageRecord } from '../../types/database';
import { CopyButton } from '../ui/CopyButton';

interface UserMessageProps {
  msg: MessageRecord;
  isLight: boolean;
  onPreviewImage: (url: string, title: string) => void;
}

/** Bubble pesan pengguna: lampiran (gambar bernomor #1…#10 & dokumen), teks utuh, dan tombol salin. */
export function UserMessage({ msg, isLight, onPreviewImage }: UserMessageProps) {
  const images = (msg.attachments || []).filter((a) => a.type === 'image' && a.previewUrl);
  const docs = (msg.attachments || []).filter((a) => a.type !== 'image');
  const forwarded = (msg.attachments || []).filter((a) => a.savedPath).length;

  return (
    <div className="group flex flex-col items-end max-w-[min(42rem,92%)]">
      <div className="rounded-2xl rounded-br-md px-4 py-3 text-[14px] leading-relaxed bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/15 space-y-2.5 select-text">
        {images.length > 0 && (
          <div className={`grid gap-1.5 ${images.length === 1 ? 'grid-cols-1 max-w-xs' : images.length === 2 ? 'grid-cols-2 max-w-sm' : 'grid-cols-3 sm:grid-cols-4'}`}>
            {images.map((att, idx) => (
              <button
                type="button"
                key={att.id}
                onClick={() => onPreviewImage(att.previewUrl || '', `#${idx + 1} · ${att.name}`)}
                className="group/img relative rounded-lg overflow-hidden border border-white/20 aspect-square bg-black/20 cursor-zoom-in"
                title={`${att.name}${att.savedPath ? ' — diteruskan ke agen' : ''}
Klik untuk memperbesar & menyalin gambar`}
                aria-label={`Perbesar gambar #${idx + 1}: ${att.name}`}
              >
                <img src={att.previewUrl} alt={att.name} className="w-full h-full object-cover" />
                <span className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity grid place-items-center">
                  <ZoomIn className="w-4 h-4" />
                </span>
                <span className="absolute bottom-1 left-1 px-1.5 rounded bg-black/70 text-[9.5px] font-mono">#{idx + 1}</span>
                {att.savedPath && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 grid place-items-center">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {docs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {docs.map((att) => (
              <div key={att.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs bg-black/20 border border-white/15" title={att.savedPath || att.name}>
                {att.type === 'excel' ? <FileSpreadsheet className="w-4 h-4 text-emerald-300" /> : <FileText className="w-4 h-4 text-sky-200" />}
                <div className="min-w-0 max-w-[10rem]">
                  <p className="font-semibold truncate">{att.name}</p>
                  <p className="text-[10px] opacity-75 font-mono">{att.size}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {msg.content && <div className="whitespace-pre-wrap break-words">{msg.content}</div>}
      </div>

      <div className="flex items-center gap-1 mt-1 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {forwarded > 0 && (
          <span className={`text-[10.5px] mr-1 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
            {forwarded} lampiran diteruskan ke agen
          </span>
        )}
        <span className={`text-[10.5px] font-mono px-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>{msg.timestamp}</span>
        {msg.content && <CopyButton text={msg.content} isLight={isLight} />}
      </div>
    </div>
  );
}
