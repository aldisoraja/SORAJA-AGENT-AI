import { Check, Contrast, Monitor, Moon, Palette, RotateCcw, Sun } from 'lucide-react';
import type { AppSettings } from '../../types/database';
import { THEME_PRESETS } from '../../constants/agentProviders';

interface AppearanceTabProps {
  settings: AppSettings;
  isLight: boolean;
  currentAccent: string;
  onSaveMultipleSettings: (partial: Partial<AppSettings>) => Promise<void>;
  onSaveField: <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => Promise<void>;
}

const MODES = [
  { id: 'system', label: 'Ikuti Sistem', desc: 'Menyesuaikan Windows', icon: Monitor, preview: ['#f8fafc', '#0b0e17'] },
  { id: 'light', label: 'Terang', desc: 'Nyaman di siang hari', icon: Sun, preview: ['#ffffff', '#e2e8f0'] },
  { id: 'dark', label: 'Gelap', desc: 'Nyaman untuk mata', icon: Moon, preview: ['#0c101a', '#1e293b'] },
] as const;

const ACCENTS = [
  { color: '#06b6d4', name: 'Cyan' },
  { color: '#3b82f6', name: 'Biru' },
  { color: '#8b5cf6', name: 'Ungu' },
  { color: '#ec4899', name: 'Merah muda' },
  { color: '#ef4444', name: 'Merah' },
  { color: '#f59e0b', name: 'Jingga' },
  { color: '#10b981', name: 'Hijau' },
  { color: '#64748b', name: 'Abu-abu' },
];

/** Tab "Tampilan": semua pilihan cukup satu klik dan langsung diterapkan. */
export function AppearanceTab({ settings, isLight, currentAccent, onSaveMultipleSettings, onSaveField }: AppearanceTabProps) {
  const card = isLight ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const strong = isLight ? 'text-slate-900' : 'text-slate-100';
  const mode = settings.theme || 'dark';
  const accent = (settings.accentColor || currentAccent).toLowerCase();
  const isStrong = settings.contrast === 'strong';

  const heading = (icon: React.ReactNode, text: string) => (
    <h3 className={`text-sm font-bold flex items-center gap-2 ${strong}`}>
      {icon}
      {text}
    </h3>
  );

  return (
    <div className="space-y-7">
      {/* 1. Mode tema */}
      <section className="space-y-3">
        {heading(<Sun className="w-4 h-4 text-amber-500" />, 'Mode tema')}
        <div className="grid grid-cols-3 gap-3">
          {MODES.map((m) => {
            const active = mode === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSaveMultipleSettings({ theme: m.id })}
                className={`p-3 rounded-2xl border text-left transition cursor-pointer ${active ? '' : card}`}
                style={active ? { borderColor: currentAccent, boxShadow: `0 0 0 3px ${currentAccent}33` } : undefined}
              >
                <div className="h-14 rounded-xl overflow-hidden flex border border-black/10 mb-2.5">
                  <div className="flex-1" style={{ background: m.preview[0] }} />
                  <div className="w-1/3" style={{ background: m.preview[1] }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold flex items-center gap-1.5 ${strong}`}>
                    <Icon className="w-4 h-4" /> {m.label}
                  </span>
                  {active && <Check className="w-4 h-4" style={{ color: currentAccent }} />}
                </div>
                <p className={`text-[11px] mt-0.5 ${muted}`}>{m.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Warna aksen */}
      <section className="space-y-3">
        {heading(<Palette className="w-4 h-4 text-violet-500" />, 'Warna aksen')}
        <div className={`p-4 rounded-2xl border flex flex-wrap items-center gap-3 ${card}`}>
          {ACCENTS.map((a) => {
            const active = accent === a.color;
            return (
              <button
                key={a.color}
                type="button"
                title={a.name}
                onClick={() => onSaveField('accentColor', a.color)}
                className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition hover:scale-110"
                style={{ background: a.color, boxShadow: active ? `0 0 0 3px ${isLight ? '#fff' : '#0c101a'}, 0 0 0 5px ${a.color}` : undefined }}
              >
                {active && <Check className="w-4 h-4 text-white stroke-[3]" />}
              </button>
            );
          })}
          <label className={`flex items-center gap-2 text-xs cursor-pointer ml-auto ${muted}`} title="Pilih warna lain">
            <input
              type="color"
              value={accent}
              onChange={(e) => onSaveField('accentColor', e.target.value)}
              className="w-9 h-9 rounded-full border-0 bg-transparent cursor-pointer"
            />
            Warna lain
          </label>
        </div>
      </section>

      {/* 3. Gaya latar gelap */}
      {!isLight && (
        <section className="space-y-3">
          {heading(<Moon className="w-4 h-4 text-sky-400" />, 'Gaya latar (tema gelap)')}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {Object.entries(THEME_PRESETS).map(([key, preset]) => {
              const active = (settings.themePreset || 'Default Dark') === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    onSaveMultipleSettings({
                      theme: 'dark',
                      themePreset: key,
                      backgroundColor: preset.bg,
                      foregroundColor: preset.fg,
                      accentColor: preset.accent,
                    })
                  }
                  className={`p-2.5 rounded-xl border flex items-center gap-2.5 text-xs font-semibold cursor-pointer transition ${active ? 'text-white' : `${card} ${muted}`}`}
                  style={active ? { borderColor: preset.accent, background: preset.modalBg } : undefined}
                >
                  <span className="w-6 h-6 rounded-lg border border-white/10 shrink-0 flex items-end justify-end p-0.5" style={{ background: preset.bg }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: preset.accent }} />
                  </span>
                  <span className="truncate">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Kontras & reset */}
      <section className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${card}`}>
        <div>
          <p className={`text-sm font-semibold flex items-center gap-2 ${strong}`}>
            <Contrast className="w-4 h-4" /> Kontras tinggi
          </p>
          <p className={`text-xs mt-0.5 ${muted}`}>Garis tepi lebih tegas agar tampilan lebih mudah dibaca.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={isStrong}
            onClick={() => onSaveMultipleSettings({ contrast: isStrong ? 'default' : 'strong' })}
            className={`relative w-11 h-6 rounded-full transition cursor-pointer ${isStrong ? '' : isLight ? 'bg-slate-300' : 'bg-slate-700'}`}
            style={isStrong ? { background: currentAccent } : undefined}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isStrong ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </section>

      <button
        type="button"
        onClick={() => {
          const def = THEME_PRESETS['Default Dark'];
          onSaveMultipleSettings({
            theme: 'dark',
            themePreset: 'Default Dark',
            backgroundColor: def.bg,
            foregroundColor: def.fg,
            accentColor: def.accent,
            contrast: 'default',
          });
        }}
        className={`text-xs font-medium flex items-center gap-1.5 cursor-pointer hover:underline ${muted}`}
      >
        <RotateCcw className="w-3.5 h-3.5" /> Kembalikan tampilan bawaan
      </button>
    </div>
  );
}
