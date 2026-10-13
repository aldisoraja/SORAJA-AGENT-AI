import { useState, type ReactNode } from 'react';
import { Check, Eye, HardDrive, Languages, MessageSquare, ShieldCheck, Zap } from 'lucide-react';
import type { AppSettings } from '../../types/database';

interface GeneralSettingsTabProps {
  settings: AppSettings;
  isLight: boolean;
  onSaveField: <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => Promise<void>;
}

/**
 * Tab "Umum": hanya pengaturan yang benar-benar berpengaruh pada aplikasi,
 * dijelaskan dengan bahasa sehari-hari.
 */
export function GeneralSettingsTab({ settings, isLight, onSaveField }: GeneralSettingsTabProps) {
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const save = async <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    await onSaveField(key, val);
    setSavedKey(key);
    setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1800);
  };

  const card = isLight ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const strong = isLight ? 'text-slate-900' : 'text-slate-100';
  const isAutonomous = settings.securityPreset === 'Permissive';

  const Saved = ({ k }: { k: string }) =>
    savedKey === k ? (
      <span className="text-[11px] font-semibold text-emerald-500 flex items-center gap-1 animate-in fade-in">
        <Check className="w-3.5 h-3.5" /> Tersimpan
      </span>
    ) : null;

  const Section = ({ icon, title, children, k }: { icon: ReactNode; title: string; children: ReactNode; k?: string }) => (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-bold flex items-center gap-2 ${strong}`}>
          {icon}
          {title}
        </h3>
        {k && <Saved k={k} />}
      </div>
      {children}
    </section>
  );

  const Choice = ({ active, onClick, icon, title, desc, tag }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; desc: string; tag?: string }) => (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 rounded-2xl border transition cursor-pointer ${
        active
          ? isLight
            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
            : 'border-cyan-500/70 bg-cyan-500/10 ring-2 ring-cyan-500/20'
          : `${card} ${isLight ? 'hover:border-slate-300' : 'hover:border-slate-700'}`
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-2 font-semibold text-sm ${strong}`}>
          {icon}
          {title}
        </span>
        {active ? <Check className={`w-4 h-4 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} /> : tag && <span className={`text-[10px] ${muted}`}>{tag}</span>}
      </div>
      <p className={`text-xs mt-1.5 leading-relaxed ${muted}`}>{desc}</p>
    </button>
  );

  return (
    <div className="space-y-7">
      {/* 1. Kebebasan AI saat bekerja */}
      <Section icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />} title="Seberapa bebas AI boleh bekerja?" k="securityPreset">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Choice
            active={!isAutonomous}
            onClick={() => save('securityPreset', 'Default')}
            icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
            title="Mode Aman"
            tag="Disarankan"
            desc="AI boleh membaca & mengubah berkas proyek. Perintah yang berisiko akan ditolak atau ditanyakan dulu kepada Anda."
          />
          <Choice
            active={isAutonomous}
            onClick={() => save('securityPreset', 'Permissive')}
            icon={<Zap className="w-4 h-4 text-amber-500" />}
            title="Mode Otonom"
            tag="Untuk pengguna mahir"
            desc="AI menjalankan semua langkah tanpa bertanya. Lebih cepat, tetapi pastikan proyek Anda sudah dicadangkan (mis. git)."
          />
        </div>
      </Section>

      {/* 2. Tampilan obrolan */}
      <Section icon={<MessageSquare className="w-4 h-4 text-sky-500" />} title="Tampilan obrolan" k="chat">
        <div className={`rounded-2xl border divide-y ${card} ${isLight ? 'divide-slate-200' : 'divide-slate-800'}`}>
          <div className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className={`text-sm font-semibold flex items-center gap-2 ${strong}`}>
                <Eye className="w-4 h-4" /> Tampilkan proses berpikir AI
              </p>
              <p className={`text-xs mt-0.5 ${muted}`}>Isi penalaran AI langsung terbuka di setiap langkah, tidak perlu diklik satu per satu.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.verboseAgentChat}
              onClick={async () => {
                await onSaveField('verboseAgentChat', !settings.verboseAgentChat);
                setSavedKey('chat');
                setTimeout(() => setSavedKey((k) => (k === 'chat' ? null : k)), 1800);
              }}
              className={`relative w-11 h-6 rounded-full transition shrink-0 cursor-pointer ${
                settings.verboseAgentChat ? (isLight ? 'bg-blue-600' : 'bg-cyan-500') : isLight ? 'bg-slate-300' : 'bg-slate-700'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.verboseAgentChat ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          <div className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className={`text-sm font-semibold ${strong}`}>Lebar area obrolan</p>
              <p className={`text-xs mt-0.5 ${muted}`}>Pilih "Penuh" untuk layar lebar, "Ringkas" agar teks lebih mudah dibaca.</p>
            </div>
            <div className={`flex p-1 rounded-xl shrink-0 ${isLight ? 'bg-slate-100' : 'bg-slate-800/80'}`}>
              {([
                ['narrow', 'Ringkas'],
                ['default', 'Standar'],
                ['wide', 'Penuh'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={async () => {
                    await onSaveField('conversationWidth', id);
                    setSavedKey('chat');
                    setTimeout(() => setSavedKey((k) => (k === 'chat' ? null : k)), 1800);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    settings.conversationWidth === id
                      ? isLight
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'bg-slate-700 text-white shadow'
                      : muted
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="min-w-[14rem] flex-1">
              <p className={`text-sm font-semibold ${strong}`}>Kedalaman penalaran Chat</p>
              <p className={`text-xs mt-0.5 ${muted}`}>
                Di Chat, AI berpikir lebih dalam daripada di Terminal. Makin tinggi makin teliti, tetapi lebih lambat dan memakai kuota lebih banyak.
              </p>
            </div>
            <div className={`flex p-1 rounded-xl shrink-0 ${isLight ? 'bg-slate-100' : 'bg-slate-800/80'}`}>
              {([
                ['high', 'Tinggi'],
                ['xhigh', 'Sangat tinggi'],
                ['max', 'Maksimum'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={async () => {
                    await onSaveField('chatReasoningEffort', id);
                    setSavedKey('chat');
                    setTimeout(() => setSavedKey((k) => (k === 'chat' ? null : k)), 1800);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    (settings.chatReasoningEffort ?? 'high') === id
                      ? isLight
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'bg-slate-700 text-white shadow'
                      : muted
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 3. Informasi (bukan pengaturan) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={`p-4 rounded-2xl border ${card}`}>
          <p className={`text-sm font-semibold flex items-center gap-2 ${strong}`}>
            <Languages className="w-4 h-4 text-violet-500" /> Bahasa jawaban AI
          </p>
          <p className={`text-xs mt-1.5 leading-relaxed ${muted}`}>
            Semua AI (Antigravity, Claude, Codex, OpenCode) otomatis menjawab dalam Bahasa Indonesia, baik di Chat maupun di Terminal.
          </p>
        </div>
        <div className={`p-4 rounded-2xl border ${card}`}>
          <p className={`text-sm font-semibold flex items-center gap-2 ${strong}`}>
            <HardDrive className="w-4 h-4 text-emerald-500" /> Penyimpanan data
          </p>
          <p className={`text-xs mt-1.5 leading-relaxed ${muted}`}>
            Riwayat obrolan & pengaturan disimpan di komputer ini saja. Login akun AI dikelola oleh aplikasi CLI masing-masing — Soraja tidak menyimpan kata sandi Anda.
          </p>
        </div>
      </div>
    </div>
  );
}
