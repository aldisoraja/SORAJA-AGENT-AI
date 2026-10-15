import { Bell, Brain, Eye, Gauge, Languages, ShieldCheck, Volume2, Zap } from 'lucide-react';
import type { AppSettings, ChatReasoningEffort } from '../../types/database';
import { playFinishChime } from '../../hooks/useFinishNotifier';
import { ChoiceCard, SettingRow, SettingsCard, SettingsSection, Toggle, settingsTone } from './SettingsControls';

interface GeneralSettingsTabProps {
  settings: AppSettings;
  isLight: boolean;
  currentAccent: string;
  onSaveField: <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => Promise<void>;
}

const EFFORTS: { id: ChatReasoningEffort; title: string; desc: string }[] = [
  { id: 'high', title: 'Normal', desc: 'Cepat & hemat kuota. Cocok untuk pertanyaan sehari-hari.' },
  { id: 'xhigh', title: 'Teliti', desc: 'Berpikir lebih lama untuk tugas yang rumit.' },
  { id: 'max', title: 'Paling teliti', desc: 'Paling lambat & paling boros kuota. Untuk masalah sulit.' },
];

/**
 * Tab "Umum": cara AI bekerja. Setiap pilihan langsung dipakai pada pesan Chat berikutnya.
 */
export function GeneralSettingsTab({ settings, isLight, currentAccent, onSaveField }: GeneralSettingsTabProps) {
  const t = settingsTone(isLight);
  const isAutonomous = settings.securityPreset === 'Permissive';
  const effort = settings.chatReasoningEffort ?? 'high';

  return (
    <div className="space-y-7">
      {/* 1. Kebebasan AI */}
      <SettingsSection isLight={isLight} icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />} title="Seberapa bebas AI boleh bekerja?">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ChoiceCard
            isLight={isLight}
            accent={currentAccent}
            active={!isAutonomous}
            onClick={() => onSaveField('securityPreset', 'Default')}
            icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
            title="Mode Aman"
            tag="Disarankan"
            desc="AI boleh membaca & mengubah berkas proyek. Perintah yang berisiko ditanyakan dulu kepada Anda."
          />
          <ChoiceCard
            isLight={isLight}
            accent={currentAccent}
            active={isAutonomous}
            onClick={() => onSaveField('securityPreset', 'Permissive')}
            icon={<Zap className="w-4 h-4 text-amber-500" />}
            title="Mode Otonom"
            tag="Untuk pengguna mahir"
            desc="AI menjalankan semua langkah tanpa bertanya. Lebih cepat — pastikan proyek sudah dicadangkan (mis. git)."
          />
        </div>
      </SettingsSection>

      {/* 2. Ketelitian AI */}
      <SettingsSection
        isLight={isLight}
        icon={<Gauge className="w-4 h-4 text-sky-500" />}
        title="Ketelitian AI di Chat"
        hint="Makin teliti, makin bagus hasilnya untuk tugas sulit — tetapi lebih lama dan memakai kuota lebih banyak."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {EFFORTS.map((e) => (
            <ChoiceCard
              key={e.id}
              isLight={isLight}
              accent={currentAccent}
              active={effort === e.id}
              onClick={() => onSaveField('chatReasoningEffort', e.id)}
              icon={<Brain className="w-4 h-4" />}
              title={e.title}
              desc={e.desc}
            />
          ))}
        </div>
      </SettingsSection>

      {/* 3. Saat AI bekerja */}
      <SettingsSection isLight={isLight} icon={<Bell className="w-4 h-4 text-violet-500" />} title="Saat AI bekerja">
        <SettingsCard isLight={isLight}>
          <SettingRow
            isLight={isLight}
            icon={<Eye className="w-4 h-4" />}
            title="Tampilkan proses berpikir AI"
            desc="Langkah & alasan AI langsung terbuka di setiap jawaban, tidak perlu diklik satu per satu."
          >
            <Toggle
              isLight={isLight}
              accent={currentAccent}
              label="Tampilkan proses berpikir AI"
              checked={settings.verboseAgentChat}
              onChange={(v) => onSaveField('verboseAgentChat', v)}
            />
          </SettingRow>
          <SettingRow
            isLight={isLight}
            icon={<Volume2 className="w-4 h-4" />}
            title="Beri tahu saat AI selesai"
            desc="Bunyi pendek saat jawaban selesai. Bila Anda sedang membuka aplikasi lain, ikon Soraja di taskbar ikut berkedip."
          >
            <div className="flex items-center gap-3">
              <button type="button" onClick={playFinishChime} className={`text-xs font-medium cursor-pointer hover:underline ${t.muted}`}>
                Coba bunyi
              </button>
              <Toggle
                isLight={isLight}
                accent={currentAccent}
                label="Beri tahu saat AI selesai"
                checked={settings.notifyOnFinish ?? true}
                onChange={(v) => onSaveField('notifyOnFinish', v)}
              />
            </div>
          </SettingRow>
        </SettingsCard>
      </SettingsSection>

      <p className={`text-xs flex items-start gap-2 leading-relaxed ${t.muted}`}>
        <Languages className="w-4 h-4 shrink-0 text-violet-500" />
        Semua AI (Antigravity, Claude, Codex, OpenCode, Kiro) otomatis menjawab dalam Bahasa Indonesia, baik di Chat maupun di Terminal.
      </p>
    </div>
  );
}
