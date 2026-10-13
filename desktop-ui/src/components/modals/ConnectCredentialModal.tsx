import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Terminal, UserCheck, UserX, X } from 'lucide-react';
import type { AgentProvider } from '../../types/agent';
import { fetchUserCliProfile, type CliAgentStatus, type UserCliProfile } from '../../services/cliAdapters';

interface ConnectCredentialModalProps {
  provider: AgentProvider | null;
  installedCliStatus?: CliAgentStatus;
  onClose: () => void;
  /** Aktifkan agen ini (sinkron akun dari CLI + jadikan agen terpilih). */
  onUseAgent: (provider: AgentProvider) => Promise<void> | void;
  /** Buka tab Terminal CLI agen ini untuk login. */
  onOpenTerminal: (provider: AgentProvider) => void;
  isLight?: boolean;
}

const LOGIN_HINT: Record<string, string> = {
  claude: 'ketik /login',
  codex: 'jalankan codex login',
  antigravity: 'ikuti login Google saat pertama dibuka',
  opencode: 'jalankan opencode auth login',
};

/**
 * Hubungkan agen. Seluruh agen memakai login bawaan mesin CLI (OAuth & paket langganan),
 * jadi modal ini hanya menampilkan status CLI + akun dan dua aksi: pakai agen / buka terminal.
 */
export function ConnectCredentialModal({
  provider,
  installedCliStatus,
  onClose,
  onUseAgent,
  onOpenTerminal,
  isLight = false,
}: ConnectCredentialModalProps) {
  const [profile, setProfile] = useState<UserCliProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!provider) return;
    setIsLoading(true);
    setProfile(await fetchUserCliProfile(provider.id));
    setIsLoading(false);
  }, [provider]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (!provider) return null;

  const isInstalled = !!(installedCliStatus?.is_installed ?? provider.isInstalled);
  const loggedIn = !!profile?.isLoggedIn;
  const account = [profile?.name, profile?.email].filter(Boolean).join(' · ');
  const panel = isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';

  const handleUse = async () => {
    setIsActivating(true);
    try {
      await onUseAgent(provider);
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className={`fixed inset-0 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-150 ${isLight ? 'bg-slate-900/40' : 'bg-black/80'}`}>
      <div
        className={`w-full max-w-md rounded-3xl border p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0c101a] border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${panel}`}>{provider.icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base">Hubungkan {provider.name}</h3>
            <p className={`text-xs ${muted}`}>{provider.vendor}</p>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg cursor-pointer ${isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`} title="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status */}
        <div className={`rounded-2xl border divide-y text-xs ${panel} ${isLight ? 'divide-slate-200' : 'divide-slate-800'}`}>
          <div className="flex items-center justify-between gap-2 p-3">
            <span className="flex items-center gap-2 font-medium">
              <Terminal className="w-4 h-4 shrink-0" /> Mesin CLI <code className="font-mono">{provider.executable}</code>
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isInstalled ? 'bg-emerald-500/15 text-emerald-500' : 'bg-slate-500/15 text-slate-400'}`}>
              {isInstalled ? 'Terpasang' : 'Belum terpasang'}
            </span>
          </div>

          <div className="p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : loggedIn ? (
                  <UserCheck className="w-4 h-4 text-emerald-500" />
                ) : (
                  <UserX className="w-4 h-4 text-slate-400" />
                )}
                {isLoading ? 'Memeriksa akun…' : loggedIn ? 'Akun terdeteksi' : 'Belum login'}
              </span>
              <button onClick={loadProfile} className={`p-1 rounded-md cursor-pointer ${isLight ? 'hover:bg-slate-200' : 'hover:bg-slate-800'}`} title="Periksa ulang">
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {loggedIn ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {account && <span className="font-semibold">{account}</span>}
                {(profile?.accountType || profile?.planTier) && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {profile?.accountType || profile?.planTier}
                  </span>
                )}
              </div>
            ) : (
              !isLoading && (
                <p className={`leading-relaxed ${muted}`}>
                  Sesi login belum terdeteksi. Silakan login melalui terminal mesin CLI ({LOGIN_HINT[provider.id] || 'ikuti petunjuk di terminal'}), lalu tekan ↻.
                </p>
              )
            )}
          </div>
        </div>

        {/* Aksi */}
        <div className="flex gap-2">
          {loggedIn ? (
            <>
              <button
                onClick={() => onOpenTerminal(provider)}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${isLight ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-800 hover:bg-slate-800'}`}
              >
                Buka Terminal CLI
              </button>
              <button
                onClick={handleUse}
                disabled={isActivating}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-70"
              >
                {isActivating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Gunakan Agen Ini
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleUse}
                disabled={isActivating}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition disabled:opacity-70 ${isLight ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-800 hover:bg-slate-800'}`}
              >
                Tetap Gunakan
              </button>
              <button
                onClick={() => onOpenTerminal(provider)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Terminal className="w-3.5 h-3.5" /> Buka Terminal CLI
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
