import { useState } from 'react';
import { X, SlidersHorizontal, Palette, KeyRound, FolderGit2, Pin, CheckCircle2, LifeBuoy } from 'lucide-react';
import type { AppSettings, ProjectRecord, CredentialRecord } from '../../types/database';
import type { AgentProvider } from '../../types/agent';
import { SETTINGS_CATEGORIES } from '../../constants/agentProviders';
import { ModelsUsageDashboard } from './ModelsUsageDashboard';
import type { CliAgentStatus } from '../../services/cliAdapters';
import { AppearanceTab } from './AppearanceTab';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { ProjectDetailPanel } from './ProjectDetailPanel';
import { DataHelpTab } from './DataHelpTab';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  projects: ProjectRecord[];
  credentials: Record<string, CredentialRecord>;
  agentProviders: AgentProvider[];
  dbHealth: { mode: string; sizeKb: string } | null;
  isLight: boolean;
  isHighContrast: boolean;
  currentBg: string;
  currentFg: string;
  currentAccent: string;
  currentModalBg: string;
  currentModalSidebar: string;
  onSaveField: <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => Promise<void>;
  onSaveMultipleSettings: (partial: Partial<AppSettings>) => Promise<void>;
  onSyncLiveQuota: () => Promise<void>;
  onOpenConnectModal: (provider: AgentProvider) => void;
  installedCliAgents?: Record<string, CliAgentStatus>;
  onSelectProject?: (project: ProjectRecord) => void;
  onTogglePinProject?: (projectId: string) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  projects,
  credentials,
  agentProviders,
  dbHealth: _dbHealth,
  isLight,
  isHighContrast,
  currentBg: _currentBg,
  currentFg: _currentFg,
  currentAccent,
  currentModalBg,
  currentModalSidebar,
  onSaveField,
  onSaveMultipleSettings,
  onSyncLiveQuota,
  onOpenConnectModal,
  installedCliAgents,
  onSelectProject,
  onTogglePinProject,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<string>('General');

  if (!isOpen) return null;

  // Ikon kategori di sidebar
  const getCategoryIcon = (catId: string) => {
    switch (catId) {
      case 'General':
        return <SlidersHorizontal className="w-4 h-4 shrink-0" />;
      case 'Appearance':
        return <Palette className="w-4 h-4 shrink-0" />;
      case 'Models':
        return <KeyRound className="w-4 h-4 shrink-0" />;
      case 'Data':
        return <LifeBuoy className="w-4 h-4 shrink-0" />;
      default:
        return <SlidersHorizontal className="w-4 h-4 shrink-0" />;
    }
  };

  // Proyek aktif yang sedang dipilih di sidebar
  const selectedProject = projects.find((p) => p.name === activeTab || p.id === activeTab);

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-150">
        <div
          className={`rounded-3xl w-[980px] max-w-full h-[700px] max-h-[92vh] shadow-[0_0_60px_-15px_rgba(0,0,0,0.6)] flex flex-row overflow-hidden relative backdrop-blur-xl animate-in zoom-in-95 duration-150 border transition-all ${
            isLight
              ? `bg-white text-slate-900 ${isHighContrast ? 'border-2 border-slate-400' : 'border-slate-200'}`
              : `text-slate-100 ${isHighContrast ? 'border-2 border-slate-600' : 'border-slate-800'}`
          }`}
          style={!isLight ? { backgroundColor: currentModalBg, borderColor: isHighContrast ? undefined : `${currentAccent}40` } : {}}
        >
          {/* Top ambient glow bar */}
          <div
            className="absolute top-0 left-0 right-0 h-1 z-20 pointer-events-none transition-all duration-300"
            style={{ background: `linear-gradient(to right, transparent, ${currentAccent}, transparent)` }}
          />

          {/* Modal Left Sidebar */}
          <div
            className={`w-64 shrink-0 border-r p-3.5 flex flex-col justify-between transition-colors ${
              isLight
                ? `bg-slate-50 ${isHighContrast ? 'border-r-2 border-slate-400' : 'border-slate-200'}`
                : `${isHighContrast ? 'border-r-2 border-slate-600' : 'border-slate-800/80'}`
            }`}
            style={!isLight ? { backgroundColor: currentModalSidebar } : {}}
          >
            <div className="space-y-4 overflow-y-auto pr-1">
              <div>
                <p className={`text-[11px] font-bold px-2.5 mb-1.5 tracking-wider uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Kategori Pengaturan
                </p>
                <div className="space-y-1">
                  {SETTINGS_CATEGORIES.map((cat) => {
                    const isActive = activeTab === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setActiveTab(cat.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-2.5 ${
                          isActive
                            ? isLight
                              ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                              : 'bg-slate-800/90 text-white shadow-sm border border-slate-700/80'
                            : isLight
                            ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                        }`}
                        style={isActive ? { color: currentAccent, borderColor: `${currentAccent}50` } : {}}
                      >
                        {getCategoryIcon(cat.id)}
                        <span className="flex-1">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {projects.length > 0 && (
                <div>
                  <p className={`text-[11px] font-bold px-2.5 mb-1.5 tracking-wider uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Proyek Anda ({projects.length})
                  </p>
                  <div className="space-y-1">
                    {projects.map((p) => {
                      const isActive = activeTab === p.name || activeTab === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setActiveTab(p.name)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-2 ${
                            isActive
                              ? isLight
                                ? 'bg-white text-blue-600 font-bold shadow-sm border border-slate-200'
                                : 'bg-slate-800/90 text-white font-bold shadow-sm border border-slate-700/80'
                              : isLight
                              ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                          }`}
                          style={isActive ? { color: currentAccent, borderColor: `${currentAccent}50` } : {}}
                        >
                          <FolderGit2 className="w-3.5 h-3.5 shrink-0 opacity-70" />
                          <span className="truncate flex-1">{p.name}</span>
                          {p.isPinned && <Pin className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Sidebar Footer: Indikator ramah penyimpanan privat */}
            <div className={`p-2.5 border-t rounded-2xl ${isLight ? 'border-slate-200 bg-slate-100/60' : 'border-slate-800/80 bg-slate-900/50'}`}>
              <div className="flex items-center gap-2 text-[11px] font-medium text-emerald-500">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Tersimpan Aman di Komputer</span>
              </div>
              <p className={`text-[10px] mt-0.5 pl-5.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                100% privat tanpa pelacakan cloud
              </p>
            </div>
          </div>

          {/* Modal Content Area */}
          <div
            className={`flex-1 flex flex-col h-full overflow-hidden transition-colors ${
              isLight ? 'bg-white text-slate-900' : 'text-slate-100'
            }`}
            style={!isLight ? { backgroundColor: currentModalBg } : {}}
          >
            {/* Header Konten */}
            <div className={`p-6 pb-4 border-b flex items-start justify-between ${
              isLight
                ? `${isHighContrast ? 'border-b-2 border-slate-400' : 'border-slate-200'}`
                : `${isHighContrast ? 'border-b-2 border-slate-600' : 'border-slate-800/80'}`
            }`}>
              <div>
                <h2 className={`text-xl font-bold tracking-tight flex items-center gap-2.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {selectedProject ? (
                    <>
                      <FolderGit2 className="w-5 h-5 text-cyan-400" />
                      <span>Detail Proyek: {selectedProject.name}</span>
                    </>
                  ) : (
                    <>
                      {getCategoryIcon(activeTab)}
                      <span>
                        {activeTab === 'General' && 'Pengaturan Umum'}
                        {activeTab === 'Appearance' && 'Tampilan'}
                        {activeTab === 'Models' && 'Akun & Kuota AI'}
                        {activeTab === 'Data' && 'Data & Bantuan'}
                      </span>
                    </>
                  )}
                </h2>
                <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {selectedProject
                    ? 'Informasi direktori kerja, riwayat repositori, dan tindakan cepat untuk proyek ini.'
                    : activeTab === 'General'
                    ? 'Atur cara AI bekerja di Chat. Perubahan langsung berlaku untuk pesan berikutnya.'
                    : activeTab === 'Appearance'
                    ? 'Atur tema, warna, dan ukuran tampilan. Perubahan langsung diterapkan.'
                    : activeTab === 'Data'
                    ? 'Lihat data yang tersimpan, kembalikan pengaturan bawaan, dan pelajari pintasan keyboard.'
                    : 'Lihat akun yang terhubung, paket langganan, dan sisa kuota tiap AI — dibaca langsung dari aplikasi CLI-nya.'}
                </p>
              </div>
              <button
                onClick={onClose}
                className={`p-1.5 rounded-xl cursor-pointer transition ${
                  isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Tutup Pengaturan (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
              {/* TAB 1: UMUM */}
              {activeTab === 'General' && (
                <GeneralSettingsTab
                  settings={settings}
                  isLight={isLight}
                  currentAccent={currentAccent}
                  onSaveField={onSaveField}
                />
              )}

              {/* TAB 2: MODELS */}
              {activeTab === 'Models' && (
                <ModelsUsageDashboard
                  credentials={credentials}
                  agentProviders={agentProviders}
                  isLight={isLight}
                  onSyncLiveQuota={onSyncLiveQuota}
                  onOpenConnectModal={onOpenConnectModal}
                  installedCliAgents={installedCliAgents}
                />
              )}

              {/* TAB 3: APPEARANCE */}
              {activeTab === 'Appearance' && (
                <AppearanceTab
                  settings={settings}
                  isLight={isLight}
                  currentAccent={currentAccent}
                  onSaveMultipleSettings={onSaveMultipleSettings}
                  onSaveField={onSaveField}
                />
              )}

              {/* TAB 4: DATA & BANTUAN */}
              {activeTab === 'Data' && (
                <DataHelpTab isLight={isLight} currentAccent={currentAccent} onSaveMultipleSettings={onSaveMultipleSettings} />
              )}

              {/* TAB DETAIL PROYEK */}
              {selectedProject && (
                <ProjectDetailPanel
                  project={selectedProject}
                  isLight={isLight}
                  onSelectProject={onSelectProject}
                  onTogglePinProject={onTogglePinProject}
                />
              )}
            </div>
          </div>
        </div>
      </div>

    </>
  );
}
