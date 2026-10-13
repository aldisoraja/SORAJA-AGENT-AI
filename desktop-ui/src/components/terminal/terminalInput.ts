/**
 * terminalInput.ts
 * Helper input keyboard xterm: shortcut zoom/clear/copy & deteksi judul tab dari prompt pertama.
 */
import type { Terminal as XTerm } from '@xterm/xterm';
import { writeTextToClipboard } from '../../utils/imagePasteHelper';

const SLASH_SYSTEM_CMD = /^\/(clear|exit|quit|help|models|model|stats|cost|usage)\b/i;
const SHELL_SYSTEM_CMD = /^(cls|clear|exit|quit|help|ls|dir)\b/i;

export function isSystemCommand(text: string): boolean {
  return SLASH_SYSTEM_CMD.test(text) || SHELL_SYSTEM_CMD.test(text);
}

interface KeyHandlerDeps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  sendInput: (data: string) => void;
}

/** Shortcut: Ctrl +/-/0 (zoom), Ctrl+L (redraw), Ctrl+C (salin bila ada seleksi). */
export function createKeyHandler(term: XTerm, deps: KeyHandlerDeps) {
  return (e: KeyboardEvent): boolean => {
    if (e.type !== 'keydown' || !(e.ctrlKey || e.metaKey)) return true;
    if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') {
      deps.onZoomIn?.();
      return false;
    }
    if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
      deps.onZoomOut?.();
      return false;
    }
    if (e.key === '0' || e.code === 'Numpad0') {
      deps.onResetZoom?.();
      return false;
    }
    if (e.key === 'l' || e.key === 'L') {
      try {
        term.clear();
      } catch {}
      deps.sendInput('\x0c');
      return false;
    }
    if ((e.key === 'c' || e.key === 'C') && term.hasSelection()) {
      const selected = term.getSelection();
      if (selected) writeTextToClipboard(selected);
      return false; // jangan kirim \x03 (interupsi) ke CLI
    }
    return true;
  };
}
