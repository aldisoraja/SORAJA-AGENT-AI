/**
 * imagePasteHelper.ts
 * Helper utilitas untuk menangani copy-paste teks dan gambar di antarmuka terminal Soraja AI.
 * Mendukung ekstraksi gambar clipboard, penyimpanan ke folder proyek lokal (.soraja/images/),
 * serta pembacaan/penulisan teks multibaris (kata, kalimat, paragraf).
 */

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

/**
 * Menyimpan data gambar Base64 ke server backend lokal
 */
export async function saveBase64ImageToServer(
  projectPath: string,
  imageBase64: string,
  filename?: string
): Promise<SavedImageResult> {
  try {
    const response = await fetch('/api/save-clipboard-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectPath,
        imageBase64,
        filename,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errJson.error || `HTTP error ${response.status}`,
      };
    }

    const data: SavedImageResult = await response.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Gagal terhubung ke endpoint penyimpan gambar',
    };
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
