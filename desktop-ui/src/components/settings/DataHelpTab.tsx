import { useEffect, useState } from 'react';
import { Database, FolderGit2, HardDrive, Keyboard, KeyRound, MessagesSquare, RotateCcw, ShieldCheck } from 'lucide-react';
import type { AppSettings } from '../../types/database';
import { sorajaDb } from '../../services/db';
import { DEFAULT_SETTINGS } from '../../services/dbDefaults';
import { SettingRow, SettingsCard, SettingsSection, settingsTone } from './SettingsControls';

interface DataHelpTabProps {
  isLight: boolean;
  currentAccent: string;
  onSaveMultipleSettings: (partial: Partial<AppSettings>) => Promise<void>;
}

type Health = Awaited<ReturnType<typeof sorajaDb.getDatabaseHealth>>;

const SHORTCUTS: [string, string][] = [
  ['Enter', 'Kirim pesan di Chat'],
  ['@', 'Sebut berkas proyek sebagai referensi'],
  ['/', 'Buka daftar perintah cepat'],
  ['Ctrl + V', 'Tempel gambar ke Chat atau Terminal'],
  ['Ctrl + Plus / Minus', 'Perbesar / perkecil huruf Terminal'],
  ['Ctrl + 0', 'Kembalikan ukuran huruf Terminal'],
];

/** Tab "Data & Bantuan": isi penyimpanan lokal, reset pengaturan, dan pintasan keyboard. */
export function DataHelpTab({ isLight, currentAccent, onSaveMultipleSettings }: DataHelpTabProps) {
  const t = settingsTone(isLight);
  const [health, setHealth] = useState<Health | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    sorajaDb.getDatabaseHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  const stats = [
    { icon: FolderGit2, label: 'Proyek', value: health?.totalProjects },
    { icon: MessagesSquare, label: 'Obrolan', value: health?.totalSessions },
    { icon: Database, label: 'Pesan', value: health?.totalMessages },
    { icon: HardDrive, label: 'Ukuran', value: health?.sizeKb },
  ];

  const kbd = `px-1.5 py-0.5 rounded-md border text-[11px] font-mono font-semibold ${isLight ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-200'}`;

  return (
    <div className="space-y-7">
      {/* 1. Data di komputer ini */}
      <SettingsSection
        isLight={isLight}
        icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}
        title="Data Anda di komputer ini"
        hint="Riwayat obrolan & pengaturan hanya disimpan di komputer ini — tidak dikirim ke server Soraja."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className={`p-3.5 rounded-2xl border ${t.card}`}>
              <p className={`text-[11px] font-medium flex items-center gap-1.5 ${t.muted}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </p>
              <p className={`text-lg font-bold mt-1 ${t.strong}`}>{value ?? '–'}</p>
            </div>
          ))}
        </div>
        <p className={`text-xs flex items-start gap-2 leading-relaxed ${t.muted}`}>
          <KeyRound className="w-4 h-4 shrink-0" />
          Login akun AI dikelola oleh aplikasi CLI masing-masing (Claude, Codex, dll.). Soraja tidak menyimpan kata sandi Anda.
        </p>
      </SettingsSection>

      {/* 2. Reset pengaturan */}
      <SettingsSection isLight={isLight} icon={<RotateCcw className="w-4 h-4 text-amber-500" />} title="Mulai ulang pengaturan">
        <SettingsCard isLight={isLight}>
          <SettingRow
            isLight={isLight}
            title="Kembalikan semua pengaturan ke bawaan"
            desc="Tema, ukuran, mode kerja AI, dan ketelitian kembali seperti saat pertama dipasang. Proyek & riwayat obrolan tetap aman."
          >
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setConfirmReset(false)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${t.muted}`}>
                  Batal
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onSaveMultipleSettings({ ...DEFAULT_SETTINGS });
                    setConfirmReset(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer bg-amber-500 text-white hover:bg-amber-600"
                >
                  Ya, kembalikan
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition hover:opacity-80"
                style={{ borderColor: currentAccent, color: currentAccent }}
              >
                Kembalikan
              </button>
            )}
          </SettingRow>
        </SettingsCard>
      </SettingsSection>

      {/* 3. Pintasan keyboard */}
      <SettingsSection isLight={isLight} icon={<Keyboard className="w-4 h-4 text-sky-500" />} title="Pintasan yang berguna">
        <SettingsCard isLight={isLight}>
          {SHORTCUTS.map(([keys, desc]) => (
            <div key={keys} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <span className={`text-xs ${t.strong}`}>{desc}</span>
              <span className={kbd}>{keys}</span>
            </div>
          ))}
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
