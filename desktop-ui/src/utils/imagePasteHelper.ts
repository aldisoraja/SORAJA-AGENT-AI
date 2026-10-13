/**
 * imagePasteHelper.ts
 * Helper utilitas untuk menangani copy-paste teks dan gambar di antarmuka terminal Soraja AI.
 * Mendukung ekstraksi gambar clipboard, penyimpanan ke folder proyek lokal (.soraja/images/),
 * serta pembacaan/penulisan teks multibaris (kata, kalimat, paragraf).
 */
import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../services/headlessTransport';

export interface SavedImageResult {
  success: boolean;
  filePath?: string;
  filename?: string;
  error?: string;
}

/**
 * Mengubah Blob gambar menjadi string Base64 Data URL
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal mengonversi blob ke Base64'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca blob gambar'));
    reader.readAsDataURL(blob);
  });
}

/** Id "pesan" tetap untuk lampiran terminal: berkas masuk ke `<proyek>/.soraja/attachments/terminal-cli/`. */
const TERMINAL_ATTACHMENT_ID = 'terminal-cli';

/**
 * Menyimpan gambar (data URL/Base64) ke folder proyek agar CLI agen bisa membacanya.
 * Desktop: IPC Tauri `save_chat_attachment` (specs/ipc-contracts.md §4). Browser dev: jembatan Vite
 * `/api/save-chat-attachment`.
 */
export async function saveBase64ImageToServer(
  projectPath: string,
  imageBase64: string,
  filename?: string
): Promise<SavedImageResult> {
  if (!projectPath) return { success: false, error: 'Folder proyek belum dipilih.' };
  const fileName = filename || `lampiran_${Date.now()}.png`;
  try {
    if (isTauriRuntime) {
      const filePath = await invoke<string>('save_chat_attachment', {
        projectPath,
        messageId: TERMINAL_ATTACHMENT_ID,
        fileName,
        dataBase64: imageBase64,
      });
      return { success: true, filePath, filename: fileName };
    }
    const response = await fetch('/api/save-chat-attachment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath, messageId: TERMINAL_ATTACHMENT_ID, fileName, dataBase64: imageBase64 }),
    });
    const body = (await response.json().catch(() => ({}))) as { filePath?: string; error?: string };
    if (!response.ok || !body.filePath) return { success: false, error: body.error || `HTTP ${response.status}` };
    return { success: true, filePath: body.filePath, filename: fileName };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Mencoba membaca item gambar dari clipboard sistem pengguna
 */
export async function readImageFromClipboard(): Promise<{ blob: Blob; filename: string } | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.read) {
    return null;
  }

  try {
    // WebView2 menolak clipboard.read() bila dokumen tidak sedang fokus (mis. setelah klik menu).
    window.focus();
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        const ext = imageType.split('/')[1] || 'png';
        const filename = `lampiran_${Date.now()}.${ext}`;
        return { blob, filename };
      }
    }
  } catch (err) {
    console.debug('Clipboard tidak memiliki permission gambar atau kosong:', err);
  }

  return null;
}

/**
 * Membaca teks dari clipboard sistem pengguna
 */
export async function readTextFromClipboard(): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return '';
  }

  try {
    return await navigator.clipboard.readText();
  } catch (err) {
    console.warn('Gagal membaca teks clipboard:', err);
    return '';
  }
}

/**
 * Menyalin teks ke clipboard sistem pengguna
 */
export async function writeTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.warn('Gagal menyalin teks ke clipboard:', err);
    return false;
  }
}
