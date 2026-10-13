import { AlertCircle, Zap } from 'lucide-react';
import type { SidebarProps } from './Sidebar';

type SidebarAgentPillProps = Pick<
  SidebarProps,
  'credentials' | 'installedCliAgents' | 'onOpenChangeAgentWizard' | 'onOpenConnectModal' | 'selectedAgent' | 'selectedModel'
> & { isLight: boolean };

/** Identitas agen aktif di bawah sidebar: status CLI, akun & tombol ganti agen. */
export function SidebarAgentPill({
  isLight,
  credentials,
  installedCliAgents = {},
  onOpenChangeAgentWizard,
  onOpenConnectModal,
  selectedAgent,
  selectedModel,
}: SidebarAgentPillProps) {
  return (
    <>
        {/* D. Bottom Active Agent Identity Pill */}
        <div className={`p-2.5 border-t ${
          isLight ? 'border-slate-200/90 bg-slate-50/70' : 'border-slate-800/80 bg-[#0d111c]/90'
        }`}>
          <div className="flex items-center justify-between text-xs mb-1.5 px-0.5">
            <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              isLight ? 'text-slate-600' : 'text-slate-400'
            }`}>
              <Zap className={`w-3 h-3 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} /> Agen AI Aktif
            </span>
            {(() => {
              const isCliInstalled = !!installedCliAgents[selectedAgent.id]?.is_installed;
              const cred = credentials[selectedAgent.id];
              // Status = sesi login CLI bawaan (bukan API key): credentials.isConnected diisi dari profil CLI.
              const isLoggedIn = !!cred?.isConnected;
              const plan = cred?.accountType || cred?.planTier;

              if (isCliInstalled && isLoggedIn) {
                return (
                  <button
                    onClick={() => onOpenConnectModal(selectedAgent)}
                    title={`Login CLI aktif${cred?.email ? ` (${cred.email})` : ''}. Tidak perlu API Key. Klik untuk detail akun.`}
                    className={`text-[9px] px-2 py-0.5 rounded-full border font-bold flex items-center gap-1 font-mono cursor-pointer transition max-w-[60%] ${
                      isLight
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="truncate">TERHUBUNG{plan ? ` · ${plan}` : ' (CLI Native)'}</span>
                  </button>
                );
              }

              if (isCliInstalled) {
                return (
                  <button
                    onClick={() => onOpenConnectModal(selectedAgent)}
                    title="CLI terpasang tetapi sesi login belum terdeteksi. Login lewat Terminal CLI; API Key tidak diperlukan."
                    className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold flex items-center gap-1 font-mono cursor-pointer transition ${
                      isLight
                        ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    <AlertCircle className="w-2.5 h-2.5" /> BELUM LOGIN
                  </button>
                );
              }

              return (
                <button
                  onClick={() => onOpenConnectModal(selectedAgent)}
                  className={`text-[9px] px-1.5 py-0.5 rounded border font-bold flex items-center gap-1 cursor-pointer transition ${
                    isLight
                      ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  <AlertCircle className="w-2.5 h-2.5" /> HUBUNGKAN
                </button>
              );
            })()}
          </div>

          <div className={`flex items-center justify-between p-2 rounded-xl border shadow-sm ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800/90 shadow-lg'
          }`}>
            <div className="flex items-center gap-2 truncate">
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${selectedAgent.accent} flex items-center justify-center text-xs shadow-md shrink-0`}>
                {selectedAgent.icon}
              </div>
              <div className="truncate">
                <p className={`text-xs font-bold truncate ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{selectedAgent.name}</p>
                <p className={`text-[10px] truncate font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {selectedModel.name.split(' ')[0]} • {selectedModel.speed}
                </p>
              </div>
            </div>

            <button
              onClick={onOpenChangeAgentWizard}
              className={`text-[11px] font-semibold cursor-pointer shrink-0 ml-2 px-1 hover:underline ${
                isLight ? 'text-blue-600 hover:text-blue-700' : 'text-cyan-400 hover:text-cyan-300'
              }`}
            >
              Ganti
            </button>
          </div>
        </div>
    </>
  );
}
