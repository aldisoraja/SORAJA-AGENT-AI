import type { AgentProvider } from '../../types/agent';
import { formatRemainingTime, type CredentialRecord } from '../../types/database';
import { QuotaMeter } from './QuotaMeter';

interface AgentAccountCardProps {
  provider: AgentProvider;
  cred?: CredentialRecord;
  isInstalled: boolean;
  isLight: boolean;
  onManage: (provider: AgentProvider) => void;
}

/** Kartu satu agen: status, akun & paket (dari CLI), serta sisa kuota. */
export function AgentAccountCard({ provider, cred, isInstalled, isLight, onManage }: AgentAccountCardProps) {
  const connected = !!cred?.isConnected;
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const plan = cred?.accountType || cred?.planTier;
  const account = cred?.accountName && cred?.email ? `${cred.accountName} (${cred.email})` : cred?.email || cred?.accountName;
  const longTitle = (cred?.weeklyWindowMinutes ?? 0) >= 40000 ? 'Kuota 30 hari' : 'Kuota mingguan';

  return (
    <div className={`p-4 rounded-2xl border space-y-3 transition ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
          {provider.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{provider.name}</h4>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                connected ? 'bg-emerald-500/15 text-emerald-500' : isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {connected ? '● Terhubung' : 'Belum Terhubung'}
            </span>
            {connected && plan && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${isLight ? 'soraja-grad-soft text-blue-700' : 'bg-sky-500/15 text-sky-300'}`}>
                {plan}
              </span>
            )}
          </div>
          <p className={`text-xs mt-1 truncate ${muted}`}>
            {connected
              ? account
                ? `Akun terhubung: ${account}`
                : 'Akun terhubung (nama akun tidak diekspos CLI)'
              : isInstalled
              ? 'Belum ada akun login'
              : `Aplikasi CLI ${provider.executable} belum terpasang`}
          </p>
        </div>
        <button
          onClick={() => onManage(provider)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer shrink-0 ${
            connected
              ? isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              : isLight ? 'soraja-grad-primary text-white' : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:brightness-110'
          }`}
        >
          {connected ? 'Kelola' : 'Hubungkan'}
        </button>
      </div>

      {connected && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <QuotaMeter
              isLight={isLight}
              title="Kuota 5 jam"
              remainingPercent={cred?.fiveHourLimitPercent}
              resetText={cred?.fiveHourResetTimestamp ? formatRemainingTime(cred.fiveHourResetTimestamp) : undefined}
            />
            <QuotaMeter
              isLight={isLight}
              title={longTitle}
              remainingPercent={cred?.weeklyLimitPercent}
              resetText={cred?.weeklyResetTimestamp ? formatRemainingTime(cred.weeklyResetTimestamp) : undefined}
            />
          </div>
          {cred?.statusMessage && <p className={`text-[11px] ${muted}`}>{cred.statusMessage}</p>}
        </>
      )}
    </div>
  );
}
