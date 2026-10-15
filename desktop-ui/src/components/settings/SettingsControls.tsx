import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

/** Kelas warna dasar yang dipakai semua tab pengaturan. */
export function settingsTone(isLight: boolean) {
  return {
    card: isLight ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800',
    muted: isLight ? 'text-slate-500' : 'text-slate-400',
    strong: isLight ? 'text-slate-900' : 'text-slate-100',
    divide: isLight ? 'divide-slate-200' : 'divide-slate-800',
  };
}

export function SettingsSection({ icon, title, hint, isLight, children }: { icon: ReactNode; title: string; hint?: string; isLight: boolean; children: ReactNode }) {
  const t = settingsTone(isLight);
  return (
    <section className="space-y-3">
      <div>
        <h3 className={`text-sm font-bold flex items-center gap-2 ${t.strong}`}>
          {icon}
          {title}
        </h3>
        {hint && <p className={`text-xs mt-0.5 ${t.muted}`}>{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Kartu berisi beberapa baris pengaturan yang dipisah garis. */
export function SettingsCard({ isLight, children }: { isLight: boolean; children: ReactNode }) {
  const t = settingsTone(isLight);
  return <div className={`rounded-2xl border divide-y ${t.card} ${t.divide}`}>{children}</div>;
}

/** Satu baris: judul + penjelasan di kiri, kontrol di kanan. */
export function SettingRow({ icon, title, desc, isLight, children }: { icon?: ReactNode; title: string; desc: string; isLight: boolean; children: ReactNode }) {
  const t = settingsTone(isLight);
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="min-w-[14rem] flex-1">
        <p className={`text-sm font-semibold flex items-center gap-2 ${t.strong}`}>
          {icon}
          {title}
        </p>
        <p className={`text-xs mt-0.5 leading-relaxed ${t.muted}`}>{desc}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Toggle({ checked, onChange, accent, isLight, label }: { checked: boolean; onChange: (next: boolean) => void; accent: string; isLight: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition cursor-pointer ${checked ? '' : isLight ? 'bg-slate-300' : 'bg-slate-700'}`}
      style={checked ? { background: accent } : undefined}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, isLight }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; isLight: boolean }) {
  const t = settingsTone(isLight);
  return (
    <div className={`flex p-1 rounded-xl ${isLight ? 'bg-slate-100' : 'bg-slate-800/80'}`}>
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
            value === id ? (isLight ? 'bg-white text-slate-900 shadow-sm' : 'bg-slate-700 text-white shadow') : t.muted
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Kartu pilihan besar (mis. Mode Aman vs Mode Otonom). */
export function ChoiceCard({ active, onClick, icon, title, desc, tag, accent, isLight }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; desc: string; tag?: string; accent: string; isLight: boolean }) {
  const t = settingsTone(isLight);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 rounded-2xl border transition cursor-pointer ${active ? '' : `${t.card} ${isLight ? 'hover:border-slate-300' : 'hover:border-slate-700'}`}`}
      style={active ? { borderColor: accent, background: `${accent}14`, boxShadow: `0 0 0 3px ${accent}26` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-2 font-semibold text-sm ${t.strong}`}>
          {icon}
          {title}
        </span>
        {active ? <Check className="w-4 h-4" style={{ color: accent }} /> : tag && <span className={`text-[10px] ${t.muted}`}>{tag}</span>}
      </div>
      <p className={`text-xs mt-1.5 leading-relaxed ${t.muted}`}>{desc}</p>
    </button>
  );
}
