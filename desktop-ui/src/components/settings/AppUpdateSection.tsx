import { Loader2, RefreshCw } from 'lucide-react';
import { checkForAppUpdate, describeInstallProgress, installAppUpdate, useAppUpdate } from '../../services/appUpdater';
import { SettingRow, SettingsCard, SettingsSection, settingsTone } from './SettingsControls';

/** Bagian "Versi aplikasi": versi terpasang, periksa pembaruan manual, dan pasang versi baru. */
export function AppUpdateSection({ isLight, currentAccent }: { isLight: boolean; currentAccent: string }) {
  const t = settingsTone(isLight);
  const { status, currentVersion } = useAppUpdate();
  if (status.kind === 'unsupported') return null;

  const pendingInfo = status.kind === 'available' ? status.info : status.kind === 'error' ? status.info : null;
  const desc = (() => {
    switch (status.kind) {
      case 'checking':
        return 'Memeriksa versi terbaru…';
      case 'upToDate':
        return `Anda memakai versi terbaru (diperiksa ${new Date(status.checkedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}).`;
      case 'available':
        return `Versi ${status.info.version} tersedia. Aplikasi akan ditutup & dibuka ulang saat dipasang.`;
      case 'installing':
        return describeInstallProgress(status.downloaded, status.total);
      case 'error':
        return status.message;
      default:
        return 'Soraja memeriksa pembaruan otomatis setiap kali dibuka.';
    }
  })();

  const busy = status.kind === 'checking' || status.kind === 'installing';
  const btn = 'px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition disabled:opacity-60 disabled:cursor-wait';

  return (
    <SettingsSection isLight={isLight} icon={<RefreshCw className="w-4 h-4 text-violet-500" />} title="Versi aplikasi">
      <SettingsCard isLight={isLight}>
        <SettingRow isLight={isLight} title={`Soraja Engine ${currentVersion ?? ''}`.trim()} desc={desc}>
          {pendingInfo ? (
            <button type="button" onClick={() => void installAppUpdate()} className={`${btn} text-white hover:opacity-90`} style={{ background: currentAccent }}>
              Perbarui ke {pendingInfo.version}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void checkForAppUpdate()}
              className={`${btn} border hover:opacity-80`}
              style={{ borderColor: currentAccent, color: currentAccent }}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {status.kind === 'installing' ? 'Memperbarui…' : 'Periksa pembaruan'}
            </button>
          )}
        </SettingRow>
        {pendingInfo?.notes && (
          <div className="px-4 py-3">
            <p className={`text-[11px] font-semibold mb-1 ${t.muted}`}>Catatan rilis {pendingInfo.version}</p>
            <p className={`text-xs whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto ${t.strong}`}>{pendingInfo.notes}</p>
          </div>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
