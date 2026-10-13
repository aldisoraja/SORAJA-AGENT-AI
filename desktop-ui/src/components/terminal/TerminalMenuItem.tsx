import React from 'react';

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

export const MenuSectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{children}</div>
);

export const MenuDivider: React.FC<{ isLight: boolean }> = ({ isLight }) => (
  <div className={`my-1 border-t ${isLight ? 'border-slate-100' : 'border-slate-800'}`} />
);

export const TerminalMenuItem: React.FC<{
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle: React.ReactNode;
  onClick: () => void;
}> = ({ icon, title, subtitle, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-blue-50 dark:hover:bg-slate-800/80 transition cursor-pointer"
  >
    {icon}
    <div>
      <div className="font-semibold text-slate-800 dark:text-slate-100">{title}</div>
      <div className="text-[11px] text-slate-400">{subtitle}</div>
    </div>
  </button>
);
