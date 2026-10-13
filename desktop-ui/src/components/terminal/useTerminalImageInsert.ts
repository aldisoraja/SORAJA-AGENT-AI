/**
 * useTerminalImageInsert.ts
 * Menyisipkan gambar ke prompt CLI di terminal: dari clipboard (tombol "Tempel Gambar" / Ctrl+V)
 * atau dari berkas yang dipilih pengguna secara eksplisit. Gambar disimpan lewat IPC Tauri
 * `save_chat_attachment`, lalu path-nya diketik ke prompt CLI yang aktif.
 */
import { useCallback, useRef } from 'react';
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
        showToast(`🖼️ Gambar (${res.filename}) disisipkan ke prompt!`);
        return true;
      }
      showToast(`⚠️ Gagal menyimpan gambar: ${res.error ?? 'penyebab tidak diketahui'}`);
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

  /** Pilihan eksplisit pengguna: buka dialog untuk memilih berkas gambar dari komputer. */
  const pickImageFile = useCallback(() => fileInputRef.current?.click(), []);

  const handleFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        await insertImage(file, file.name);
      } catch (err) {
        console.error('Gagal mengunggah gambar:', err);
        showToast('⚠️ Gagal menyisipkan gambar yang dipilih.');
      } finally {
        focusTerminal();
      }
    },
    [insertImage, focusTerminal, showToast]
  );

  return { fileInputRef, pasteImageFromClipboard, pickImageFile, handleFilePicked };
}
