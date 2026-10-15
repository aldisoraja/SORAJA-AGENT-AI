import React from 'react';
import { Activity, Clipboard, FolderOpen, Image as ImageIcon, Layers, MoreVertical, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
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
  onPickImageFile: () => void;
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
  onPickImageFile,
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
        <MoreVertical className={`w-3.5 h-3.5 ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`} />
      </button>

      {isOpen && (
        <div className={menuPanelClass(isLight, 'w-60')}>
          <MenuSectionTitle isLight={isLight}>Perintah Mesin CLI</MenuSectionTitle>
          <TerminalMenuItem
            isLight={isLight}
            icon={Layers}
            tone="cyan"
            title={slashConfig.modelLabel}
            subtitle={slashConfig.modelTitle}
            onClick={run(() => onSend('\x15' + slashConfig.modelCmd))}
          />
          <TerminalMenuItem
            isLight={isLight}
            icon={Activity}
            tone="emerald"
            title={slashConfig.usageLabel}
            subtitle={slashConfig.usageTitle}
            onClick={run(() => onSend('\x15' + slashConfig.usageCmd))}
          />
          <TerminalMenuItem
            isLight={isLight}
            icon={Sparkles}
            tone="amber"
            title="Bersihkan Layar (/clear)"
            subtitle="Redraw tampilan TUI terminal"
            onClick={run(() => {
              onClearScreen();
              onSend(activeAgentId === 'opencode' ? '\x0c' : '\x15/clear\r');
            })}
          />

          <MenuDivider isLight={isLight} />
          <MenuSectionTitle isLight={isLight}>Clipboard & Media</MenuSectionTitle>
          <TerminalMenuItem
            isLight={isLight}
            icon={Clipboard}
            tone="sky"
            title="Tempel Teks (Ctrl+V)"
            subtitle="Tempel teks multiline dari clipboard"
            onClick={run(onPasteText)}
          />
          <TerminalMenuItem
            isLight={isLight}
            icon={ImageIcon}
            tone="pink"
            title="Tempel Gambar dari Clipboard"
            subtitle="Sisipkan screenshot / gambar yang baru disalin"
            onClick={run(onPasteImage)}
          />
          <TerminalMenuItem
            isLight={isLight}
            icon={FolderOpen}
            tone="amber"
            title="Pilih Berkas Gambar dari Komputer"
            subtitle="Buka dialog untuk memilih berkas gambar"
            onClick={run(onPickImageFile)}
          />

          <MenuDivider isLight={isLight} />
          <MenuSectionTitle isLight={isLight}>Skala Tampilan (Zoom)</MenuSectionTitle>
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className={`text-xs ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Ukuran Font:</span>
            <div
              className={`flex items-center rounded-lg border p-0.5 ${
                isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-900 border-slate-700'
              }`}
            >
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={onZoomOut}
                disabled={zoomLevel <= minZoom}
                className={`p-1 rounded disabled:opacity-40 transition cursor-pointer ${isLight ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-900' : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-100'}`}
                title="Perkecil (-)"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={onResetZoom}
                className={`px-1.5 py-0.5 text-[10px] font-mono font-bold hover:underline cursor-pointer ${isLight ? 'text-cyan-700 hover:text-cyan-800' : 'text-cyan-400 hover:text-cyan-300'}`}
                title="Reset 100%"
              >
                {zoomLevel}%
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={onZoomIn}
                disabled={zoomLevel >= maxZoom}
                className={`p-1 rounded disabled:opacity-40 transition cursor-pointer ${isLight ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-900' : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-100'}`}
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
