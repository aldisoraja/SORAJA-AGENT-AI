import { useState } from 'react';
import { X, Folder, FolderPlus, Check, MessageSquare, Terminal } from 'lucide-react';
import type { AgentProvider } from '../../types/agent';
import type { CredentialRecord, ProjectRecord } from '../../types/database';
import type { CliAgentStatus } from '../../services/cliAdapters';

interface NewProjectModalProps {
  isOpen: boolean;
  wizardStep: 1 | 2 | 3;
  pickedFolderName: string;
  pickedFolderPath: string;
  activeProject: ProjectRecord | null;
  selectedAgent: AgentProvider;
  credentials: Record<string, CredentialRecord>;
  agentProviders: AgentProvider[];
  installedCliAgents?: Record<string, CliAgentStatus>;
  isLight?: boolean;
  onClose: () => void;
  onPickFolderDirectly: () => void;
  onSetWizardStep: (step: 1 | 2 | 3) => void;
  onFinishProjectCreation: (agent: AgentProvider, mode?: 'chat' | 'terminal') => void;
}

export function NewProjectModal({
  isOpen,
  wizardStep,
  pickedFolderName,
  pickedFolderPath,
  activeProject,
  selectedAgent,
  credentials,
  agentProviders,
  installedCliAgents = {},
  isLight = false,
  onClose,
  onPickFolderDirectly,
  onSetWizardStep,
  onFinishProjectCreation,
}: NewProjectModalProps) {
  const [chosenAgentId, setChosenAgentId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<'chat' | 'terminal'>('chat');

  if (!isOpen) return null;

  // Alur proyek baru (folder sudah dipilih): agen dipilih dulu, lalu lanjut ke Langkah 3.
  const isNewProjectFlow = !!pickedFolderName;
  const chosenAgent = agentProviders.find((a) => a.id === chosenAgentId) ?? selectedAgent;
  const highlightedAgentId = isNewProjectFlow ? chosenAgent.id : selectedAgent.id;
  const handleClose = () => {
    setChosenAgentId(null);
    setSelectedMode('chat');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 select-none animate-in fade-in duration-150">
      <div className={`rounded-3xl max-w-lg w-full p-6 relative overflow-hidden animate-in zoom-in-95 duration-150 space-y-4 border ${
        isLight
          ? 'bg-white/95 text-slate-800 border-slate-200 shadow-2xl'
          : 'bg-[#0c101a] text-slate-100 border-cyan-500/30 shadow-[0_0_60px_-10px_rgba(6,182,212,0.25)]'
      }`}>
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent ${
          isLight ? 'via-blue-500' : 'via-cyan-400'
        } to-transparent`} />
        <div className={`flex items-center justify-between border-b pb-3 ${
          isLight ? 'border-slate-200' : 'border-slate-800/80'
        }`}>
          <div className="flex items-center gap-2.5">
            <FolderPlus className={`w-5 h-5 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
            <div>
              <h3 className={`font-bold text-base ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {wizardStep === 1
                  ? 'Langkah 1: Gunakan Folder (Ruang Kerja)'
                  : wizardStep === 3
                  ? 'Langkah 3: Pilih Mode Tampilan'
                  : pickedFolderName
                  ? 'Langkah 2: Pilih Agen AI (Proyek Baru)'
                  : 'Ganti Agen AI untuk Ruang Kerja Aktif'}
              </h3>
              <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {wizardStep === 1
                  ? 'Pilih folder repositori dari komputer Anda'
                  : `Menghubungkan AI ke: ${pickedFolderName || activeProject?.name || 'Ruang Kerja Baru'}`}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className={`p-1 rounded-lg transition cursor-pointer ${
            isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
          }`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1 */}
        {wizardStep === 1 && (
          <div className="space-y-4">
            <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Buka folder repositori dari komputer Anda. Dialog explorer asli Windows akan dibuka langsung.
            </p>

            <div
              onClick={onPickFolderDirectly}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition group ${
                isLight
                  ? 'border-blue-300 hover:border-blue-500 bg-blue-50/40 hover:bg-blue-50/70'
                  : 'border-cyan-500/40 hover:border-cyan-400 bg-slate-950/60 hover:bg-slate-950'
              }`}
            >
              <Folder className={`w-10 h-10 group-hover:scale-110 transition mx-auto mb-2 ${
                isLight ? 'text-blue-600' : 'text-cyan-400'
              }`} />
              <p className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                Klik untuk Memilih Folder (Gunakan Folder)
              </p>
              <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                Membuka dialog file explorer Windows tanpa notifikasi upload
              </p>
            </div>

            {pickedFolderName && (
              <div className={`p-3 rounded-xl flex items-center justify-between border animate-fadeIn ${
                isLight
                  ? 'bg-blue-50 border-blue-200 text-blue-900'
                  : 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200'
              }`}>
                <div className="flex items-center gap-2.5 truncate">
                  <div className={`p-2 rounded-lg ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-cyan-500/20 text-cyan-300'}`}>
                    <Folder className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold truncate">{pickedFolderName}</p>
                    <p className={`text-[10px] font-mono truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{pickedFolderPath}</p>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold shrink-0 border ${
                  isLight
                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                    : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                }`}>
                  Folder Siap ✓
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleClose}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-transparent'
                }`}
              >
                Batal
              </button>
              <button
                onClick={() => onSetWizardStep(2)}
                disabled={!pickedFolderName}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs disabled:opacity-40 transition cursor-pointer shadow-md ${
                  isLight
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/20'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-950/40'
                }`}
              >
                Lanjut: Pilih Agen AI →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {wizardStep === 2 && (
          <div className="space-y-4">
            <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Pilih Agen AI yang akan mengorkestrasi proyek <strong>{pickedFolderName || activeProject?.name || 'baru ini'}</strong>.
            </p>

            <div className="space-y-2">
              {agentProviders.map((agent) => {
                const cliInfo = installedCliAgents[agent.id];
                const isCliInstalled = !!cliInfo?.is_installed;
                const isCredConnected = !!credentials[agent.id]?.isConnected;

                return (
                  <div
                    key={agent.id}
                    onClick={() => (isNewProjectFlow ? setChosenAgentId(agent.id) : onFinishProjectCreation(agent))}
                    className={`p-3 rounded-2xl border text-xs cursor-pointer transition flex items-center justify-between ${
                      highlightedAgentId === agent.id
                        ? isLight
                          ? 'bg-blue-50/90 border-blue-400 shadow-xs ring-1 ring-blue-400'
                          : 'bg-cyan-950/40 border-cyan-500/70 shadow-sm ring-1 ring-cyan-500/40'
                        : isLight
                        ? 'bg-slate-50/80 hover:bg-white border-slate-200 hover:border-slate-300'
                        : 'bg-slate-950/80 border-slate-800/80 hover:bg-slate-900/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs border ${
                        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800/80'
                      }`}>
                        {agent.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{agent.name}</p>
                          <span
                            title={cliInfo?.path || agent.binaryPath || `Perintah eksekusi: ${cliInfo?.executable || agent.id}`}
                            className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-semibold ${
                            isCliInstalled
                              ? isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/40'
                              : isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-400'
                          }`}>
                            CLI: {cliInfo?.executable || agent.id}
                          </span>
                        </div>
                        <p className={`text-[10px] truncate max-w-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          {agent.models.map((m) => m.name.replace(/^(Gemini|Claude)\s+/i, '')).join(' • ')}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {isCliInstalled ? (
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border flex items-center gap-1 font-mono ${
                          isLight
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        }`}>
                          <Check className="w-3 h-3" /> CLI Native
                        </span>
                      ) : isCredConnected ? (
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border flex items-center gap-1 font-mono ${
                          isLight
                            ? 'text-sky-700 bg-sky-50 border-sky-200'
                            : 'text-sky-400 bg-sky-500/10 border-sky-500/20'
                        }`}>
                          <Check className="w-3 h-3" /> API Key Cloud
                        </span>
                      ) : (
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border font-mono ${
                          isLight
                            ? 'text-amber-700 bg-amber-50 border-amber-200'
                            : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        }`}>
                          Perlu Dihubungkan
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              {pickedFolderName ? (
                <>
                  <button
                    onClick={() => onSetWizardStep(1)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-transparent'
                    }`}
                  >
                    ← Kembali ke Folder
                  </button>
                  <button
                    onClick={() => onSetWizardStep(3)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer shadow-md ${
                      isLight
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/20'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-950/40'
                    }`}
                  >
                    Lanjut: Pilih Mode Tampilan →
                  </button>
                </>
              ) : (
                <button
                  onClick={handleClose}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-transparent'
                  }`}
                >
                  Tutup
                </button>
              )}
            </div>
          </div>
        )}
        {/* STEP 3 */}
        {wizardStep === 3 && (
          <div className="space-y-4">
            <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Pilih cara bekerja dengan <strong>{chosenAgent.name}</strong> di <strong>{pickedFolderName}</strong>.
            </p>

            <div className="space-y-2">
              {([
                { mode: 'chat', Icon: MessageSquare, title: 'Chat GUI', desc: 'Antarmuka percakapan AI interaktif, streaming jawaban, analisis kode, dan Vibe Coding' },
                { mode: 'terminal', Icon: Terminal, title: 'Mesin CLI Terminal', desc: 'Konsol PTY interaktif langsung menggunakan binary native agen di direktori proyek' },
              ] as const).map(({ mode, Icon, title, desc }) => (
                <div
                  key={mode}
                  onClick={() => setSelectedMode(mode)}
                  className={`p-3 rounded-2xl border text-xs cursor-pointer transition flex items-center gap-3 ${
                    selectedMode === mode
                      ? isLight
                        ? 'bg-blue-50/90 border-blue-400 ring-1 ring-blue-400'
                        : 'bg-cyan-950/40 border-cyan-500/70 ring-1 ring-cyan-500/40'
                      : isLight
                      ? 'bg-slate-50/80 hover:bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-slate-950/80 border-slate-800/80 hover:bg-slate-900/80 hover:border-slate-700'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                    isLight ? 'bg-white border-slate-200 text-blue-600' : 'bg-slate-900 border-slate-800/80 text-cyan-400'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{title}</p>
                    <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => onSetWizardStep(2)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-transparent'
                }`}
              >
                ← Kembali ke Agen
              </button>
              <button
                onClick={() => {
                  onFinishProjectCreation(chosenAgent, selectedMode);
                  setChosenAgentId(null);
                  setSelectedMode('chat');
                }}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer shadow-md ${
                  isLight
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/20'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-950/40'
                }`}
              >
                {selectedMode === 'terminal' ? 'Buka di Terminal CLI' : 'Mulai Proyek'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
