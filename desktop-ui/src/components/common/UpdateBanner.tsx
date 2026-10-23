import { useEffect } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import {
  describeInstallProgress,
  dismissAppUpdate,
  installAppUpdate,
  startAppUpdateAutoCheck,
  useAppUpdate,
} from '../../services/appUpdater';

interface UpdateBannerProps {
  isLight: boolean;
  currentAccent: string;
}

/**
 * Kartu "Versi baru tersedia" di pojok kanan bawah (di atas toast). Muncul setelah pemeriksaan otomatis
 * menemukan versi baru; "Nanti" menyembunyikannya sampai aplikasi dibuka lagi (masih bisa dipasang dari
 * Pengaturan > Data & Bantuan).
 */
export function UpdateBanner({ isLight, currentAccent }: UpdateBannerProps) {
  const { status, dismissedVersion } = useAppUpdate();

  useEffect(() => startAppUpdateAutoCheck(), []);

  const info = status.kind === 'available' || status.kind === 'installing' ? status.info : status.kind === 'error' ? status.info : null;
  // Banner gagal-pasang ("Coba lagi") juga harus bisa ditutup lewat "Nanti"/X; hanya progres pemasangan yang selalu tampil.
  if (!info || (status.kind !== 'installing' && dismissedVersion === info.version)) return null;

  const installing = status.kind === 'installing';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';

  return (
    <div
      role="status"
      className={`fixed bottom-20 right-6 z-[60] w-80 p-4 rounded-2xl border shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 ${
        isLight ? 'bg-white/95 border-slate-200 text-slate-900' : 'bg-slate-900/95 border-slate-700 text-slate-100'
      }`}
    >
      <div className="flex items-start gap-3">
        <Download className="w-5 h-5 shrink-0 mt-0.5" style={{ color: currentAccent }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Soraja Engine {info.version} tersedia</p>
          <p className={`text-xs mt-0.5 leading-relaxed ${muted}`}>
            {installing
              ? describeInstallProgress(status.downloaded, status.total)
              : status.kind === 'error'
                ? status.message
                : `Versi Anda ${info.currentVersion}. Aplikasi akan ditutup & dibuka ulang; agen yang sedang berjalan ikut berhenti.`}
          </p>
        </div>
        {!installing && (
          <button
            type="button"
            aria-label="Tutup"
            onClick={() => dismissAppUpdate(info.version)}
            className={`p-1 -m-1 rounded-md cursor-pointer hover:opacity-70 ${muted}`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-3">
        {!installing && (
          <button type="button" onClick={() => dismissAppUpdate(info.version)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${muted}`}>
            Nanti
          </button>
        )}
        <button
          type="button"
          disabled={installing}
          onClick={() => void installAppUpdate()}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer text-white flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-wait"
          style={{ background: currentAccent }}
        >
          {installing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {installing ? 'Memperbarui…' : status.kind === 'error' ? 'Coba lagi' : 'Perbarui sekarang'}
        </button>
      </div>
    </div>
  );
}
