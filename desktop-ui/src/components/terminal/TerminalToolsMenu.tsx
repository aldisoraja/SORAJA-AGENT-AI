import React from 'react';
import { Activity, Clipboard, Image as ImageIcon, Layers, MoreVertical, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import type { SlashConfig } from './slashConfig';
import { MenuDivider, MenuSectionTitle, TerminalMenuItem, menuPanelClass, menuTriggerClass } from './TerminalMenuItem';

interface TerminalToolsMenuProps {
  isLight: boolean;
  isOpen: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  slashConfig: SlashConfig;
  activeAgentId: string;
  zoomLevel: number;
  minZoom: number;
  maxZoom: number;
  onToggle: () => void;
  onClose: () => void;
  onSend: (data: string) => void;
  onClearScreen: () => void;
  onPasteText: () => void;
  onPasteImage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export const TerminalToolsMenu: React.FC<TerminalToolsMenuProps> = ({
  isLight,
  isOpen,
  menuRef,
  slashConfig,
  activeAgentId,
  zoomLevel,
  minZoom,
  maxZoom,
  onToggle,
  onClose,
  onSend,
  onClearScreen,
  onPasteText,
  onPasteImage,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        className={`p-1.5 rounded-lg border transition cursor-pointer shadow-2xs flex items-center justify-center ${menuTriggerClass(isLight, isOpen)}`}
        title="Alat mesin, clipboard, kuota & opsi terminal"
        aria-label="Alat CLI"
      >
        <MoreVertical className="w-3.5 h-3.5 text-cyan-400" />
      </button>

      {isOpen && (
        <div className={menuPanelClass(isLight, 'w-60')}>
          <MenuSectionTitle>Perintah Mesin CLI</MenuSectionTitle>
          <TerminalMenuItem
            icon={<Layers className="w-4 h-4 text-cyan-400 shrink-0" />}
            title={slashConfig.modelLabel}
            subtitle={slashConfig.modelTitle}
            onClick={run(() => onSend('\x15' + slashConfig.modelCmd))}
          />
          <TerminalMenuItem
            icon={<Activity className="w-4 h-4 text-emerald-400 shrink-0" />}
            title={slashConfig.usageLabel}
            subtitle={slashConfig.usageTitle}
            onClick={run(() => onSend('\x15' + slashConfig.usageCmd))}
          />
          <TerminalMenuItem
            icon={<Sparkles className="w-4 h-4 text-amber-400 shrink-0" />}
            title="Bersihkan Layar (/clear)"
            subtitle="Redraw tampilan TUI terminal"
            onClick={run(() => {
              onClearScreen();
              onSend(activeAgentId === 'opencode' ? '\x0c' : '\x15/clear\r');
            })}
          />

          <MenuDivider isLight={isLight} />
          <MenuSectionTitle>Clipboard & Media</MenuSectionTitle>
          <TerminalMenuItem
            icon={<Clipboard className="w-4 h-4 text-sky-400 shrink-0" />}
            title="Tempel Teks (Ctrl+V)"
            subtitle="Tempel teks multiline dari clipboard"
            onClick={run(onPasteText)}
          />
          <TerminalMenuItem
            icon={<ImageIcon className="w-4 h-4 text-pink-400 shrink-0" />}
            title="Sisipkan Gambar"
            subtitle="Kirim gambar dari clipboard / file"
            onClick={run(onPasteImage)}
          />

          <MenuDivider isLight={isLight} />
          <MenuSectionTitle>Skala Tampilan (Zoom)</MenuSectionTitle>
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 text-xs">Ukuran Font:</span>
            <div
              className={`flex items-center rounded-lg border p-0.5 ${
                isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-slate-700'
              }`}
            >
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={onZoomOut}
                disabled={zoomLevel <= minZoom}
                className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-slate-100 disabled:opacity-40 transition cursor-pointer"
                title="Perkecil (-)"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={onResetZoom}
                className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
                title="Reset 100%"
              >
                {zoomLevel}%
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={onZoomIn}
                disabled={zoomLevel >= maxZoom}
                className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-slate-100 disabled:opacity-40 transition cursor-pointer"
                title="Perbesar (+)"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
