import React from 'react';
import { Bug, ChevronDown, FileText, HelpCircle, Lightbulb, Play, Sparkles } from 'lucide-react';
import { MenuDivider, MenuSectionTitle, TerminalMenuItem, menuPanelClass, menuTriggerClass } from './TerminalMenuItem';

const QUICK_PROMPTS = [
  {
    icon: <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />,
    title: 'Jelaskan Proyek Ini',
    subtitle: 'Analisis struktur dan fungsi aplikasi',
    prompt: 'Jelaskan apa fungsi project ini dan bagaimana strukturnya dalam bahasa Indonesia sederhana.\r',
  },
  {
    icon: <Bug className="w-4 h-4 text-rose-400 shrink-0" />,
    title: 'Cari & Perbaiki Bug',
    subtitle: 'Deteksi error dan perbaiki otomatis',
    prompt: 'Periksa seluruh kode aplikasi ini, deteksi jika ada error atau bug, dan perbaiki secara otomatis.\r',
  },
  {
    icon: <Play className="w-4 h-4 text-emerald-400 shrink-0" />,
    title: 'Cara Menjalankan App',
    subtitle: 'Panduan eksekusi di lokal',
    prompt: 'Bagaimana cara menjalankan aplikasi ini langkah demi langkah di komputer saya?\r',
  },
  {
    icon: <FileText className="w-4 h-4 text-cyan-400 shrink-0" />,
    title: 'Ringkas Fitur Utama',
    subtitle: 'Rangkuman kapabilitas sistem',
    prompt: 'Buatkan daftar fitur utama aplikasi ini secara singkat dan jelas.\r',
  },
];

interface QuickActionsMenuProps {
  isLight: boolean;
  isOpen: boolean;
  isHelpOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onClose: () => void;
  onSend: (data: string) => void;
  onToggleHelp: () => void;
}

export const QuickActionsMenu: React.FC<QuickActionsMenuProps> = ({
  isLight,
  isOpen,
  isHelpOpen,
  menuRef,
  onToggle,
  onClose,
  onSend,
  onToggleHelp,
}) => (
  <div className="relative" ref={menuRef}>
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 shadow-2xs ${menuTriggerClass(isLight, isOpen)}`}
      title="Template instruksi & prompt cepat"
    >
      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
      <span className="hidden xs:inline">Aksi Cepat</span>
      <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
    </button>

    {isOpen && (
      <div className={menuPanelClass(isLight, 'w-64')}>
        <MenuSectionTitle>Template Perintah Cepat</MenuSectionTitle>
        {QUICK_PROMPTS.map((item) => (
          <TerminalMenuItem
            key={item.title}
            icon={item.icon}
            title={item.title}
            subtitle={item.subtitle}
            onClick={() => {
              onSend(item.prompt);
              onClose();
            }}
          />
        ))}
        <MenuDivider isLight={isLight} />
        <TerminalMenuItem
          icon={<HelpCircle className="w-4 h-4 text-blue-400 shrink-0" />}
          title={isHelpOpen ? 'Tutup Panduan Pemula' : 'Buka Panduan Pemula'}
          subtitle="Panduan interaktif & shortcut"
          onClick={() => {
            onToggleHelp();
            onClose();
          }}
        />
      </div>
    )}
  </div>
);
