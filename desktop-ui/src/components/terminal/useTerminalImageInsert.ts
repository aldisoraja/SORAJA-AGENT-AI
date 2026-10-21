/**
 * useTerminalImageInsert.ts
 * Menyisipkan gambar/berkas ke prompt CLI di terminal: gambar dari clipboard (tombol "Tempel Gambar" /
 * Ctrl+V) disimpan lewat IPC Tauri `save_chat_attachment`; berkas apa pun yang dipilih pengguna secara
 * eksplisit disisipkan sebagai path absolut. Agen CLI lalu membaca berkas dari path tersebut.
 */
import { useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../../services/headlessTransport';
import { blobToBase64, readImageFromClipboard, saveBase64ImageToServer } from '../../utils/imagePasteHelper';

interface Deps {
  /** Folder proyek tab aktif tempat gambar disimpan. */
  targetDir: string;
  sendInput: (data: string) => void;
  focusTerminal: () => void;
  showToast: (msg: string) => void;
}

export function useTerminalImageInsert({ targetDir, sendInput, focusTerminal, showToast }: Deps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const insertImage = useCallback(
    async (blob: Blob, filename: string): Promise<boolean> => {
      const res = await saveBase64ImageToServer(targetDir, await blobToBase64(blob), filename);
      if (res.success && res.filePath) {
        sendInput(`"${res.filePath}" `);
        showToast(`📎 Berkas (${res.filename}) disisipkan ke prompt!`);
        return true;
      }
      showToast(`⚠️ Gagal menyimpan berkas:${res.error ?? 'penyebab tidak diketahui'}`);
      return false;
    },
    [targetDir, sendInput, showToast]
  );

  /** Tempel gambar dari clipboard. Tidak pernah membuka dialog berkas; hanya memberi tahu bila clipboard tanpa gambar. */
  const pasteImageFromClipboard = useCallback(async () => {
    focusTerminal(); // WebView2 hanya mengizinkan membaca clipboard saat dokumen fokus
    try {
      const clipboardImage = await readImageFromClipboard();
      if (!clipboardImage) {
        showToast('⚠️ Tidak ada gambar di clipboard. Salin gambar atau screenshot terlebih dahulu.');
        return;
      }
      await insertImage(clipboardImage.blob, clipboardImage.filename);
    } catch (err) {
      console.error('Gagal memproses gambar clipboard:', err);
      showToast('⚠️ Gagal membaca gambar dari clipboard.');
    }
  }, [focusTerminal, insertImage, showToast]);

  /**
   * Pilihan eksplisit pengguna: buka dialog untuk memilih satu/lebih berkas apa pun dari komputer.
   * Desktop: dialog native (`plugin:dialog|open`) → path absolut asli langsung diketik ke prompt,
   * tanpa menyalin berkas. Browser dev: `<input type="file">` → berkas disalin ke `.soraja/attachments/`.
   */
  const pickFiles = useCallback(async () => {
    if (!isTauriRuntime) {
      fileInputRef.current?.click();
      return;
    }
    const selected = await invoke<string | string[] | null>('plugin:dialog|open', {
      options: { multiple: true, directory: false, title: 'Pilih berkas untuk disisipkan ke prompt CLI' },
    }).catch((err) => {
      console.warn('Dialog berkas gagal:', err);
      showToast('⚠️ Gagal membuka dialog pemilihan berkas.');
      return null;
    });
    const paths = (Array.isArray(selected) ? selected : selected ? [selected] : []).filter(Boolean);
    if (paths.length > 0) {
      sendInput(paths.map((p) => `"${p}" `).join(''));
      showToast(`📎 ${paths.length} berkas disisipkan ke prompt!`);
    }
    focusTerminal();
  }, [sendInput, focusTerminal, showToast]);

  const handleFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      try {
        for (const file of files) await insertImage(file, file.name);
      } catch (err) {
        console.error('Gagal mengunggah berkas:', err);
        showToast('⚠️ Gagal menyisipkan berkas yang dipilih.');
      } finally {
        focusTerminal();
      }
    },
    [insertImage, focusTerminal, showToast]
  );

  return { fileInputRef, pasteImageFromClipboard, pickFiles, handleFilePicked };
}
