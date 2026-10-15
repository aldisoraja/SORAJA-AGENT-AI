import React from 'react';
import type { LucideIcon } from 'lucide-react';

export const menuPanelClass = (isLight: boolean, width: string) =>
  `absolute right-0 top-full mt-1.5 ${width} rounded-xl border shadow-xl py-1.5 z-50 text-xs animate-in fade-in slide-in-from-top-1 ${
    isLight
      ? 'bg-white border-slate-200 text-slate-800 shadow-slate-200/50'
      : 'bg-[#0d1322] border-slate-800 text-slate-200 shadow-black/80'
  }`;

export const menuTriggerClass = (isLight: boolean, isOpen: boolean) =>
  isOpen
    ? isLight
      ? 'bg-blue-100 text-blue-900 border-blue-300'
      : 'bg-cyan-950/80 text-cyan-300 border-cyan-600/60 ring-1 ring-cyan-500/30'
    : isLight
    ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700';

export type MenuIconTone = 'amber' | 'rose' | 'emerald' | 'cyan' | 'blue' | 'sky' | 'pink';

// Tema terang memakai shade -600 agar ikon kontras di latar putih; tema gelap tetap -400.
const ICON_TONE: Record<MenuIconTone, { light: string; dark: string }> = {
  amber: { light: 'text-amber-600', dark: 'text-amber-400' },
  rose: { light: 'text-rose-600', dark: 'text-rose-400' },
  emerald: { light: 'text-emerald-600', dark: 'text-emerald-400' },
  cyan: { light: 'text-cyan-600', dark: 'text-cyan-400' },
  blue: { light: 'text-blue-600', dark: 'text-blue-400' },
  sky: { light: 'text-sky-600', dark: 'text-sky-400' },
  pink: { light: 'text-pink-600', dark: 'text-pink-400' },
};

export const MenuSectionTitle: React.FC<{ isLight: boolean; children: React.ReactNode }> = ({ isLight, children }) => (
  <div
    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}
  >
    {children}
  </div>
);

export const MenuDivider: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <div className={`my-1 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`} />
);

export const TerminalMenuItem: React.FC<{
  isLight: boolean;
  icon: LucideIcon;
  tone: MenuIconTone;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  onClick: () => void;
}> = ({ isLight, icon: Icon, tone, title, subtitle, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition cursor-pointer ${
      isLight ? 'hover:bg-blue-50' : 'hover:bg-slate-800/80'
    }`}
  >
    <Icon className={`w-4 h-4 shrink-0 ${ICON_TONE[tone][isLight ? 'light' : 'dark']}`} />
    <div>
      <div className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{title}</div>
      <div className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{subtitle}</div>
    </div>
  </button>
);
