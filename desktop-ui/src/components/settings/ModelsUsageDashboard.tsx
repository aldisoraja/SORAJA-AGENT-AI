import { useEffect, useMemo, useState } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import type { CredentialRecord } from '../../types/database';
import type { AgentProvider } from '../../types/agent';
import type { CliAgentStatus } from '../../services/cliAdapters';
import { AgentAccountCard } from './AgentAccountCard';

interface ModelsUsageDashboardProps {
  credentials: Record<string, CredentialRecord>;
  agentProviders: AgentProvider[];
  installedCliAgents?: Record<string, CliAgentStatus>;
  isLight?: boolean;
  onSyncLiveQuota: () => Promise<void>;
  onOpenConnectModal: (provider: AgentProvider) => void;
}

function relativeTime(ms: number | null): string {
  if (!ms) return 'belum pernah';
  const minutes = Math.floor((Date.now() - ms) / 60000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} jam lalu` : `${Math.floor(hours / 24)} hari lalu`;
}

/** Tab "Akun & Kuota AI": akun, paket & sisa kuota tiap agen — dibaca langsung dari CLI. */
export function ModelsUsageDashboard({
  credentials,
  agentProviders,
  installedCliAgents = {},
  isLight = false,
  onSyncLiveQuota,
  onOpenConnectModal,
}: ModelsUsageDashboardProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [, setTick] = useState(0);

  // Perbarui teks "x menit lalu" secara berkala
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const lastSynced = useMemo(() => {
    const times = Object.values(credentials)
      .map((c) => Date.parse(c.updatedAt))
      .filter((t) => !Number.isNaN(t));
    return times.length ? Math.max(...times) : null;
  }, [credentials]);

  const sorted = useMemo(
    () => [...agentProviders].sort((a, b) => Number(!!credentials[b.id]?.isConnected) - Number(!!credentials[a.id]?.isConnected)),
    [agentProviders, credentials]
  );
  const connectedCount = sorted.filter((p) => credentials[p.id]?.isConnected).length;

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await onSyncLiveQuota();
    } finally {
      setIsSyncing(false);
    }
  };

  const muted = isLight ? 'text-slate-500' : 'text-slate-400';

  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
        <div className="space-y-1">
          <h4 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {connectedCount > 0 ? `${connectedCount} dari ${agentProviders.length} AI terhubung` : 'Belum ada AI yang terhubung'}
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-500 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Tersimpan aman & terenkripsi di komputer
            </span>
            <span className={`text-[11px] ${muted}`}>Terakhir diperbarui: {isSyncing ? 'menyinkronkan…' : relativeTime(lastSynced)}</span>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className={`flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-70 ${
            isLight ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200' : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
          }`}
          title="Baca ulang akun, paket & kuota dari semua CLI"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Menyinkronkan…' : 'Sinkronkan'}
        </button>
      </div>

      <div className="space-y-3">
        {sorted.map((provider) => (
          <AgentAccountCard
            key={provider.id}
            provider={provider}
            cred={credentials[provider.id]}
            isInstalled={installedCliAgents[provider.id]?.is_installed ?? !!provider.isInstalled}
            isLight={isLight}
            onManage={onOpenConnectModal}
          />
        ))}
      </div>

      <p className={`text-[11px] leading-relaxed ${muted}`}>
        Paket & kuota dibaca langsung dari aplikasi CLI masing-masing AI (login yang sama dengan di Terminal). Untuk keluar dari akun, gunakan perintah logout di Terminal CLI agen tersebut.
      </p>
    </div>
  );
}
