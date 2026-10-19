import { useEffect, useRef, type KeyboardEvent } from 'react';
import { AlertTriangle, Info, Terminal, X } from 'lucide-react';

interface TerminalPermissionModalProps {
  modal: {
    open: boolean;
    command: string;
    selectedOption: number;
  } | null;
  onClose: () => void;
  onSelectOption: (optionId: number) => void;
  onSubmit: (optionId: number) => void;
  isLight?: boolean;
  /** Judul banner; bawaan = teks demo tombol uji HITL. */
  title?: string;
  /** Keterangan di bawah pratinjau (mis. penjelasan agen tentang perintahnya). */
  description?: string;
  /** Peringatan perintah berbahaya. */
  warning?: string;
  /** Jumlah permintaan izin yang mengantre (termasuk yang tampil). */
  queueCount?: number;
  /** Opsi yang tidak boleh dipilih (mis. "selalu izinkan" untuk perintah berbahaya). */
  disabledOptions?: number[];
  /** Alasan opsi dinonaktifkan, tampil di bawah daftar opsi. */
  disabledReason?: string;
}

const OPTIONS = [
  { id: 1, label: 'Izinkan sekali', desc: 'Izinkan eksekusi satu kali ini saja' },
  { id: 2, label: 'Selalu izinkan di percakapan ini', desc: 'Berlaku selama percakapan aktif ini' },
  { id: 3, label: 'Selalu izinkan di proyek ini', desc: 'Berlaku di ruang kerja proyek ini' },
  { id: 4, label: 'Selalu izinkan secara global', desc: 'Berlaku untuk semua proyek & sesi' },
  { id: 5, label: 'Tolak (Jangan izinkan)', desc: 'Tolak eksekusi perintah terminal ini' },
];

/**
 * Modal izin HITL. Keyboard: ↑/↓ pindah opsi (melewati yang nonaktif), 1–5 pilih langsung,
 * Enter kirim, Esc lewati (= tolak). Fokus otomatis ke opsi terpilih saat modal/permintaan baru muncul.
 */
export function TerminalPermissionModal({
  modal,
  onClose,
  onSelectOption,
  onSubmit,
  isLight = false,
  title = '2 Running background tasks',
  description = 'Perintah terminal di atas akan dieksekusi di terminal terintegrasi',
  warning,
  queueCount = 0,
  disabledOptions = [],
  disabledReason,
}: TerminalPermissionModalProps) {
  const optionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const shownAt = useRef(0);
  const open = !!modal?.open;
  const selected = disabledOptions.includes(modal?.selectedOption || 1) ? 1 : modal?.selectedOption || 1;

  useEffect(() => {
    if (!open) return;
    shownAt.current = Date.now();
    optionRefs.current[selected]?.focus();
    // Fokus ulang hanya saat modal dibuka atau permintaan berikutnya dari antrean tampil.
  }, [open, modal?.command]);

  if (!modal?.open) return null;

  const enabled = OPTIONS.map((o) => o.id).filter((id) => !disabledOptions.includes(id));
  const choose = (id: number) => {
    if (disabledOptions.includes(id)) return;
    onSelectOption(id);
    optionRefs.current[id]?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Enter/angka yang sedang diketik di chat saat modal muncul tidak boleh langsung menyetujui perintah.
    const tooSoon = e.repeat || Date.now() - shownAt.current < 400;
    if ((e.key === 'Enter' || /^[1-5]$/.test(e.key)) && tooSoon) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = enabled.indexOf(selected);
      const next = enabled[(i + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length];
      choose(next);
    } else if (/^[1-5]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      choose(Number(e.key));
    } else if (e.key === 'Enter' && target.tagName !== 'BUTTON') {
      // Enter di tombol (Lewati/Tutup) biarkan perilaku bawaan tombol itu.
      e.preventDefault();
      onSubmit(selected);
    } else if (e.key === ' ' && target.getAttribute('role') === 'radio') {
      e.preventDefault();
      choose(Number(target.dataset.option));
    }
  };

  const focusRing = isLight
    ? 'focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white'
    : 'focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c101a]';
  const kbd = `inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-md border font-mono text-[9.5px] ${
    isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-900 border-slate-700 text-slate-400'
  }`;

  return (
    <div
      onKeyDown={handleKeyDown}
      className={`fixed inset-0 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-150 ${
        isLight ? 'bg-slate-900/40' : 'bg-black/85'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hitl-title"
        className={`rounded-3xl max-w-lg w-full p-6 relative overflow-hidden backdrop-blur-xl animate-in zoom-in-95 duration-150 space-y-4 border ${
          isLight
            ? 'bg-gradient-to-b from-white via-slate-50 to-white border-blue-200/80 shadow-[0_20px_50px_-15px_rgba(37,99,235,0.2)] text-slate-900'
            : 'bg-[#0c101a] border-blue-500/40 text-slate-100 shadow-[0_0_60px_-10px_rgba(59,130,246,0.3)]'
        }`}
      >
        <div className={`absolute top-0 left-0 right-0 h-1 ${
          isLight ? 'soraja-grad-line' : `bg-gradient-to-r from-transparent via-blue-500 to-transparent`
        }`} />

        {/* Top Banner */}
        <div className={`flex items-center justify-between pb-1 border-b ${
          isLight ? 'border-slate-200' : 'border-slate-800/80'
        }`}>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isLight ? 'bg-blue-400' : 'bg-cyan-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                isLight ? 'bg-blue-600' : 'bg-cyan-500'
              }`}></span>
            </span>
            <span id="hitl-title" className={`font-bold ${isLight ? 'text-blue-700' : 'text-cyan-300'}`}>
              {title}
            </span>
            {queueCount > 1 && (
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-300'}`}>
                +{queueCount - 1} menunggu
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup (tolak)"
            title="Tutup (Esc)"
            className={`p-1 rounded-lg transition cursor-pointer outline-none ${focusRing} ${
              isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Command Preview */}
        <div className="space-y-1.5">
          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 font-mono text-xs text-cyan-300 break-all flex items-center gap-2 shadow-inner">
            <Terminal className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="max-h-32 overflow-y-auto whitespace-pre-wrap select-text">{modal.command}</span>
          </div>
          <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{description}</p>
          {warning && (
            <p className={`flex items-center gap-1.5 text-[11px] font-semibold ${isLight ? 'text-rose-600' : 'text-rose-400'}`}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {warning}
            </p>
          )}
        </div>

        {/* Opsi (radio group, roving tabindex) */}
        <div role="radiogroup" aria-label="Pilihan izin" className="space-y-2 pt-1">
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            const disabled = disabledOptions.includes(opt.id);
            return (
              <div
                key={opt.id}
                ref={(el) => {
                  optionRefs.current[opt.id] = el;
                }}
                role="radio"
                data-option={opt.id}
                aria-checked={isSelected}
                aria-disabled={disabled}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => choose(opt.id)}
                className={`p-3 rounded-2xl border text-xs transition flex items-center gap-3 outline-none ${focusRing} ${
                  disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  isSelected
                    ? isLight
                      ? 'soraja-grad-soft border-blue-500/80 shadow-sm'
                      : 'bg-blue-600/15 border-blue-500/60 shadow-sm'
                    : isLight
                    ? 'bg-white/80 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                    : 'bg-slate-950/80 border-slate-800/80 hover:bg-slate-900/80 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected
                      ? isLight
                        ? 'border-blue-600 bg-blue-600'
                        : 'border-blue-400 bg-blue-500'
                      : isLight
                      ? 'border-slate-300 bg-white'
                      : 'border-slate-600 bg-slate-900'
                  }`}
                >
                  {isSelected && <div className={`w-1.5 h-1.5 rounded-full ${isLight ? 'bg-white' : 'bg-slate-950'}`}></div>}
                </div>
                <div className="truncate flex-1">
                  <p className={`font-bold ${
                    isSelected
                      ? isLight ? 'text-blue-900' : 'text-white'
                      : isLight ? 'text-slate-800' : 'text-slate-300'
                  }`}>{opt.label}</p>
                  <p className={`text-[10px] ${
                    isSelected
                      ? isLight ? 'text-blue-700' : 'text-blue-300'
                      : isLight ? 'text-slate-500' : 'text-slate-400'
                  }`}>{opt.desc}</p>
                </div>
                {!disabled && <span className={`${kbd} shrink-0`} aria-hidden>{opt.id}</span>}
              </div>
            );
          })}
          {disabledReason && disabledOptions.length > 0 && (
            <p className={`flex items-start gap-1.5 px-1 text-[10.5px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
              {disabledReason}
            </p>
          )}
        </div>

        {/* Skip and Submit Buttons */}
        <div className="space-y-2 pt-2">
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className={`flex-1 py-2.5 rounded-xl font-semibold text-xs transition cursor-pointer outline-none flex items-center justify-center gap-2 ${focusRing} ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              Lewati <span className={kbd} aria-hidden>Esc</span>
            </button>
            <button
              onClick={() => onSubmit(selected)}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer shadow-md outline-none flex items-center justify-center gap-2 ${focusRing} ${
                isLight
                  ? 'soraja-grad-primary text-white'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-blue-950/60'
              }`}
            >
              Kirim <span className="inline-grid place-items-center h-[18px] px-1 rounded-md bg-white/20 font-mono text-[9.5px]" aria-hidden>Enter ↵</span>
            </button>
          </div>
          <p className={`text-center text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            ↑/↓ atau 1–5 untuk memilih · Enter kirim · Esc lewati
          </p>
        </div>
      </div>
    </div>
  );
}
