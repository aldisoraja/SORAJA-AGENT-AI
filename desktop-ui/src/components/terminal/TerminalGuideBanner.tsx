import React from 'react';
import { CheckCircle2, X } from 'lucide-react';

export const TerminalGuideBanner: React.FC<{ isLight: boolean; onClose: () => void }> = ({ isLight, onClose }) => (
  <div
    className={`p-3 border-b text-xs transition animate-in fade-in slide-in-from-top-1 z-10 ${
      isLight
        ? 'soraja-grad-soft border-indigo-200/80 text-slate-700'
        : 'bg-gradient-to-r from-[#0c1426]/95 via-[#0e172a]/95 to-[#0c1426]/95 border-cyan-900/60 text-slate-200'
    }`}
  >
    <div className="flex items-start gap-2.5 max-w-4xl">
      <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5 border border-cyan-500/30">
        <CheckCircle2 className="w-3.5 h-3.5" />
      </div>
      <div className="space-y-1">
        <div className="font-bold text-xs flex items-center gap-1.5 text-cyan-300">
          <span>Panduan untuk Pengguna Non-Teknis: Mesin Coding AI Otonom</span>
        </div>
        <p className="text-[11px] leading-relaxed opacity-90">
          1. <strong>Tidak perlu paham koding!</strong> Anda cukup mengetik apa yang Anda butuhkan dalam{' '}
          <em>bahasa Indonesia sehari-hari</em> di layar terminal di bawah, lalu tekan <strong>Enter</strong> di
          keyboard (contoh: <code>buatkan halaman login yang modern</code>). Agen akan menjawab dalam Bahasa Indonesia.
        </p>
        <p className="text-[11px] leading-relaxed opacity-90">
          2. Mesin AI ini akan membaca file proyek secara mandiri, menulis kode, dan menguji aplikasi untuk Anda.
        </p>
        <p className="text-[11px] leading-relaxed opacity-90">
          3. Klik tombol <strong>+ Tab Baru</strong> pada baris sesi tab jika ingin membuka atau berganti mesin AI
          (misal mencoba Claude Code, Codex CLI, atau Google Antigravity). Jika terminal terasa macet, klik tombol{' '}
          <strong>↺ (Restart)</strong> di kanan atas.
        </p>
        <p className="text-[11px] leading-relaxed opacity-90">
          4. <strong>Salin & Tempel (Copy-Paste) Teks & Gambar:</strong> Sorot teks lalu tekan <code>Ctrl+C</code> untuk
          menyalin (atau klik kanan mouse). Tekan <code>Ctrl+V</code> atau gunakan menu <strong>⋮ → Tempel Teks</strong>{' '}
          / <strong>Sisipkan Gambar</strong> untuk menempel kalimat, paragraf, atau screenshot langsung ke asisten AI.
        </p>
        <p className="text-[11px] leading-relaxed opacity-90">
          5. <strong>Perbesar / Perkecil Tampilan (Zoom):</strong> Gunakan menu <strong>⋮ → Skala Tampilan</strong>, atau
          pintasan <code>Ctrl + +</code> untuk memperbesar, <code>Ctrl + -</code> untuk memperkecil, dan{' '}
          <code>Ctrl + 0</code> untuk reset ke 100%.
        </p>
      </div>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClose}
        className="text-slate-400 hover:text-slate-200 p-1 cursor-pointer shrink-0 ml-auto"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);
