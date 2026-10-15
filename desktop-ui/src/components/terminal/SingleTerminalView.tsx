import React, { useCallback, useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { TerminalTab } from '../../hooks/useTerminalManager';
import { createTerminalLocalizer } from '../../utils/cliTerminalLocalizer';
import { blobToBase64, saveBase64ImageToServer, writeTextToClipboard } from '../../utils/imagePasteHelper';
import { buildInteractiveCommand } from '../../services/cli/agentCommands';
import { prepareLanguageRules } from '../../services/cliAdapters';
import { fontSizeForZoom, minimumContrastFor, xtermTheme } from './xtermThemes';
import { adaptOutputForLightTheme } from './lightTerminalColors';
import { isTauri, ptyRelease, ptyResize, ptyRetain, ptySpawn, ptyWrite, subscribePty } from './ptyTransport';
import { createKeyHandler } from './terminalInput';

export interface SingleTerminalViewProps {
  isLight: boolean;
  tab: TerminalTab;
  isActive: boolean;
  zoomLevel?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onStatusChange?: (isRunning: boolean, exitCode: number | null) => void;
  registerSendInput: (tabId: string, fn: (data: string) => Promise<void>) => void;
  registerFocus: (tabId: string, fn: () => void) => void;
  registerClear?: (tabId: string, fn: () => void) => void;
  /** Dipanggil sekali per mount saat baris input pertama pengguna dikirim (Enter); untuk melabeli sesi CLI. */
  onFirstInput?: (line: string) => void;
}

/** Banner sambutan hanya untuk CLI non-TUI layar penuh (OpenCode menggambar ulang seluruh layar). */
function writeWelcomeBanner(term: XTerm, tab: TerminalTab) {
  term.writeln(`\x1b[1;36m┌────────────────────────────────────────────────────────────────────────┐\x1b[0m`);
  term.writeln(`\x1b[1;36m│\x1b[0m  \x1b[1;32m● SORAJA AI ENGINE\x1b[0m — Memulai Sesi: \x1b[1;33m${tab.agent.name}\x1b[0m`);
  term.writeln(`\x1b[1;36m│\x1b[0m  \x1b[90mDirektori: ${tab.projectPath}\x1b[0m`);
  if (tab.cliSessionId) {
    term.writeln(`\x1b[1;36m│\x1b[0m  \x1b[90mMelanjutkan sesi: ${tab.cliSessionId}\x1b[0m`);
  }
  term.writeln(`\x1b[1;36m│\x1b[0m  \x1b[90mTips: Gunakan tombol 'Aksi Cepat' di atas atau ketik langsung di sini.\x1b[0m`);
  term.writeln(`\x1b[1;36m└────────────────────────────────────────────────────────────────────────┘\x1b[0m\r\n`);
}

export const SingleTerminalView: React.FC<SingleTerminalViewProps> = ({
  isLight,
  tab,
  isActive,
  zoomLevel = 100,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onStatusChange,
  registerSendInput,
  registerFocus,
  registerClear,
  onFirstInput,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastColsRows = useRef<{ cols: number; rows: number }>({ cols: 0, rows: 0 });
  const hasSpawnedRef = useRef(false);

  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const onFirstInputRef = useRef(onFirstInput);
  onFirstInputRef.current = onFirstInput;
  const inputLineRef = useRef('');
  const isLightRef = useRef(isLight);
  isLightRef.current = isLight;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const zoomRef = useRef({ zoomLevel, onZoomIn, onZoomOut, onResetZoom });
  zoomRef.current = { zoomLevel, onZoomIn, onZoomOut, onResetZoom };

  const focusTerminal = useCallback(() => {
    try {
      xtermRef.current?.focus();
    } catch {}
  }, []);

  const clearTerminal = useCallback(() => {
    try {
      xtermRef.current?.clear();
    } catch {}
  }, []);

  const sendInput = useCallback((data: string) => ptyWrite(tabRef.current.sessionId, data), []);

  useEffect(() => {
    registerSendInput(tab.id, sendInput);
    registerFocus(tab.id, focusTerminal);
    registerClear?.(tab.id, clearTerminal);
  }, [tab.id, sendInput, focusTerminal, clearTerminal, registerSendInput, registerFocus, registerClear]);

  // Spawn CLI native di PTY dengan aturan bahasa & resume sesi (specs/agent-protocols.md §2)
  const spawnSession = useCallback(async () => {
    if (hasSpawnedRef.current) return;
    hasSpawnedRef.current = true;
    const term = xtermRef.current;
    if (!term) return;

    const t = tabRef.current;
    const dims = fitAddonRef.current?.proposeDimensions();
    const languageRulesPath = isTauri ? await prepareLanguageRules(t.agent.id) : undefined;
    const command = buildInteractiveCommand({
      agentId: t.agent.id,
      executable: t.agent.binaryPath || t.agent.executable || t.agent.id,
      cwd: t.projectPath,
      cliSessionId: t.cliSessionId,
      languageRulesPath,
    });

    try {
      const transport = await ptySpawn({
        sessionId: t.sessionId,
        agentExecutable: command.executable,
        agentArgs: command.args,
        cwd: t.projectPath,
        cols: dims?.cols || term.cols || 100,
        rows: dims?.rows || term.rows || 30,
        envs: command.envs,
      });
      if (transport === 'none') {
        term.writeln(`\r\n\x1b[1;33m[Mode Standalone]\x1b[0m WebSocket dev server tidak terdeteksi.\r\n`);
        onStatusChangeRef.current?.(false, -1);
      } else {
        onStatusChangeRef.current?.(true, null);
      }
    } catch (err) {
      term.writeln(`\r\n\x1b[1;31m[Tauri PTY Error]\x1b[0m Gagal spawn CLI: ${String(err)}\r\n`);
      onStatusChangeRef.current?.(false, -1);
    }
  }, []);

  const performFitAndResize = useCallback((force = false) => {
    try {
      const term = xtermRef.current;
      const fitAddon = fitAddonRef.current;
      if (!term || !fitAddon || !containerRef.current) return;
      fitAddon.fit();
      const { cols, rows } = term;
      if (cols <= 0 || rows <= 0) return;
      term.refresh(0, Math.max(0, rows - 1));
      if (!force && lastColsRows.current.cols === cols && lastColsRows.current.rows === rows) return;
      lastColsRows.current = { cols, rows };
      ptyResize(tabRef.current.sessionId, cols, rows);
    } catch {}
  }, []);

  useEffect(() => {
    if (!xtermRef.current) return;
    xtermRef.current.options.theme = xtermTheme(isLight);
    xtermRef.current.options.minimumContrastRatio = minimumContrastFor(isLight);
  }, [isLight]);

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSizeForZoom(zoomLevel);
      performFitAndResize();
    }
  }, [zoomLevel, performFitAndResize]);

  // Inisialisasi xterm (sekali per siklus hidup sesi)
  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;
    hasSpawnedRef.current = false;
    ptyRetain(tab.sessionId); // batalkan close tertunda bila ini mount ulang StrictMode

    const isWindows =
      typeof navigator !== 'undefined' &&
      (navigator.platform?.includes('Win') || navigator.userAgent?.includes('Windows'));
    const isOpencode = tab.agent.id === 'opencode';

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'Consolas, "Fira Code", "Courier New", monospace',
      fontSize: fontSizeForZoom(zoomRef.current.zoomLevel),
      lineHeight: 1.0, // menjaga kerapatan grid karakter TUI & box-drawing
      allowTransparency: true,
      convertEol: false, // WAJIB false: \n→\r\n merusak kursor TUI OpenCode
      windowsPty: isWindows ? { backend: 'conpty', buildNumber: 22621 } : undefined,
      scrollback: isOpencode ? 2000 : 5000,
      theme: xtermTheme(isLight),
      minimumContrastRatio: minimumContrastFor(isLight),
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerEl);
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    if (!isOpencode) writeWelcomeBanner(term, tabRef.current);

    term.attachCustomKeyEventHandler(
      createKeyHandler(term, {
        onZoomIn: () => zoomRef.current.onZoomIn?.(),
        onZoomOut: () => zoomRef.current.onZoomOut?.(),
        onResetZoom: () => zoomRef.current.onResetZoom?.(),
        sendInput,
      })
    );

    // Input terminal murni dikirim ke PTY; tidak boleh memicu pembuatan percakapan di sidebar chat.
    term.onData((data) => {
      sendInput(data);
      if (data.startsWith('\x1b')) return;
      // Kumpulkan ketikan sampai Enter; setiap baris terkirim dilaporkan, penerima yang memutuskan
      // apakah baris itu memberi label sesi CLI (sesi berlabel / bukan draf kosong diabaikan).
      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          const line = inputLineRef.current.trim();
          inputLineRef.current = '';
          if (line) {
            onFirstInputRef.current?.(line);
            return;
          }
        } else if (ch === '\x7f' || ch === '\b') {
          inputLineRef.current = inputLineRef.current.slice(0, -1);
        } else if (ch >= ' ') {
          inputLineRef.current += ch;
        }
      }
    });

    term.onResize(({ cols, rows }) => {
      if (lastColsRows.current.cols === cols && lastColsRows.current.rows === rows) return;
      lastColsRows.current = { cols, rows };
      ptyResize(tabRef.current.sessionId, cols, rows);
    });

    const targetSessionId = tab.sessionId;
    // Satu localizer per stream: escape sequence yang terpotong antar-chunk disambung dulu sebelum diproses.
    const localize = createTerminalLocalizer();
    const unsubscribe = subscribePty(
      targetSessionId,
      (data) => {
        // OpenCode memakai TUI dengan escape kursor presisi; regex lokalisasi akan merusak tata letaknya.
        const text = tabRef.current.agent.id === 'opencode' ? data : localize(data);
        // CLI menggambar diff dengan latar gelap; di tema terang diubah ke tint terang.
        term.write(isLightRef.current ? adaptOutputForLightTheme(text) : text);
      },
      (exitCode) => {
        onStatusChangeRef.current?.(false, exitCode);
        try {
          term.writeln(`\r\n\x1b[90m[Proses mesin CLI selesai dengan exit code: ${exitCode}]\x1b[0m\r\n`);
        } catch {}
      }
    );

    const initTimer = setTimeout(() => {
      try {
        fitAddon.fit();
        term.focus();
        if (isOpencode) {
          term.reset();
          term.write('\x1b[H\x1b[2J');
        } else {
          term.refresh(0, Math.max(0, term.rows - 1));
        }
      } catch {}
      spawnSession();
    }, 120);

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || entry.contentRect.width < 100 || entry.contentRect.height < 100) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => performFitAndResize(), 100);
    });

    // Tempel gambar: simpan ke workspace lalu kirim path-nya ke CLI. Teks dibiarkan ditangani xterm.
    const onDomPaste = async (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;
      e.preventDefault();
      e.stopPropagation();
      const file = imageItem.getAsFile();
      if (!file) return;
      try {
        const base64 = await blobToBase64(file);
        const res = await saveBase64ImageToServer(
          tabRef.current.projectPath,
          base64,
          file.name || `lampiran_${Date.now()}.png`
        );
        if (res.success && res.filePath) sendInput(`"${res.filePath}" `);
        else console.error('Gagal menyimpan gambar paste:', res.error);
      } catch (err) {
        console.error('Gagal memproses gambar paste:', err);
      }
    };

    const onContextMenu = async (e: MouseEvent) => {
      if (!term.hasSelection()) return;
      e.preventDefault();
      const sel = term.getSelection();
      if (sel) {
        await writeTextToClipboard(sel);
        term.clearSelection();
      }
    };

    containerEl.addEventListener('paste', onDomPaste, true); // capture: lebih dulu dari handler paste bawaan xterm
    containerEl.addEventListener('contextmenu', onContextMenu);
    resizeObserver.observe(containerEl);

    return () => {
      clearTimeout(initTimer);
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      containerEl.removeEventListener('paste', onDomPaste, true);
      containerEl.removeEventListener('contextmenu', onContextMenu);
      unsubscribe();
      ptyRelease(targetSessionId);
      term.dispose();
    };
  }, [tab.id, tab.sessionId, spawnSession, sendInput, performFitAndResize]);

  // Saat tab aktif: spawn bila belum, re-fit, dan paksa redraw agar ConPTY/TUI me-render ulang buffer
  useEffect(() => {
    if (!isActive) return;
    if (!hasSpawnedRef.current) spawnSession();
    performFitAndResize();
    const timer = setTimeout(() => {
      try {
        performFitAndResize();
        const term = xtermRef.current;
        if (term) {
          term.refresh(0, Math.max(0, term.rows - 1));
          term.scrollToBottom();
          term.focus();
        }
      } catch {}
    }, 40);
    const secondaryTimer = setTimeout(() => {
      try {
        const term = xtermRef.current;
        if (term && term.rows > 0) term.refresh(0, term.rows - 1);
      } catch {}
    }, 120);
    return () => {
      clearTimeout(timer);
      clearTimeout(secondaryTimer);
    };
  }, [isActive, performFitAndResize, spawnSession]);

  return (
    <div
      className={`absolute inset-0 w-full h-full min-h-0 min-w-0 p-2 overflow-hidden transition-opacity duration-75 ${
        isActive ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
      } ${isLight ? 'bg-slate-50' : 'bg-[#090d16]'}`}
    >
      <div
        ref={containerRef}
        className="w-full h-full min-h-0 min-w-0 p-0 overflow-hidden focus:outline-none"
        onClick={focusTerminal}
      />
    </div>
  );
};
