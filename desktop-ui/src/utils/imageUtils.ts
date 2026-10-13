export const MAX_CHAT_IMAGES = 10;

/**
 * Checks whether a file or MIME type represents an image.
 */
export function isImageFile(file: File | { type: string; name?: string }): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  if (file.name && /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(file.name)) return true;
  return false;
}

/**
 * Extracts all image files from a ClipboardEvent.
 */
export function extractImagesFromClipboard(e: React.ClipboardEvent | ClipboardEvent): File[] {
  const images: File[] = [];
  const clipboardData = 'clipboardData' in e ? e.clipboardData : null;
  if (!clipboardData) return images;

  // 1. Check items first (best for screenshots / copied bitmaps)
  if (clipboardData.items && clipboardData.items.length > 0) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          images.push(file);
        }
      }
    }
  }

  // 2. If no items, check files (e.g. copied files from Explorer)
  if (images.length === 0 && clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const file = clipboardData.files[i];
      if (isImageFile(file)) {
        images.push(file);
      }
    }
  }

  return images;
}

/**
 * Extracts all image files from a DragEvent.
 */
export function extractImagesFromDataTransfer(e: React.DragEvent): File[] {
  const images: File[] = [];
  if (e.dataTransfer?.files) {
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i];
      if (isImageFile(file)) {
        images.push(file);
      }
    }
  }
  return images;
}

/** Gambar yang disiapkan untuk chat: data penuh untuk agen + thumbnail ringan untuk riwayat. */
export interface ProcessedChatImage {
  /** Data URL resolusi tinggi yang disimpan ke berkas & dibaca agen (tidak disimpan di riwayat). */
  dataUrl: string;
  /** Thumbnail JPEG kecil untuk bubble & riwayat (hemat kuota localStorage). */
  previewUrl: string;
}

/** Di bawah ukuran ini format asli dipertahankan apa adanya (teks di screenshot tetap tajam). */
const KEEP_ORIGINAL_BYTES = 5 * 1024 * 1024;
/** Sisi terpanjang untuk gambar besar; cukup untuk OCR teks kecil oleh model vision. */
const MAX_FULL_DIM = 2560;
const THUMB_DIM = 720;
const NATIVE_FORMATS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca berkas'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src = src;
  });
}

/** Menggambar ulang dengan sisi terpanjang `maxDim`; PNG dipakai untuk menjaga ketajaman teks. */
function renderScaled(img: HTMLImageElement, maxDim: number, mime: 'image/png' | 'image/jpeg', quality?: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(mime, quality);
}

/**
 * Menyiapkan gambar chat. Gambar ≤ 5 MB berformat umum dikirim apa adanya (tanpa kompresi lossy);
 * gambar besar/format lain dirender ulang maks 2560 px. Thumbnail 720 px dipakai untuk tampilan riwayat.
 */
export async function processChatImage(file: File): Promise<ProcessedChatImage> {
  const original = await readAsDataUrl(file);
  try {
    const img = await loadImage(original);
    const keep = file.size <= KEEP_ORIGINAL_BYTES && NATIVE_FORMATS.includes(file.type);
    const dataUrl = keep
      ? original
      : file.type === 'image/jpeg'
        ? renderScaled(img, MAX_FULL_DIM, 'image/jpeg', 0.92)
        : renderScaled(img, MAX_FULL_DIM, 'image/png');
    return { dataUrl, previewUrl: renderScaled(img, THUMB_DIM, 'image/jpeg', 0.82) };
  } catch {
    // SVG/format yang tak bisa dirender di canvas: kirim data asli.
    return { dataUrl: original, previewUrl: original };
  }
}

/** Membaca dokumen (PDF/Word/Excel/teks) sebagai data URL agar bisa disimpan untuk dibaca agen. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return readAsDataUrl(file);
}

/** Ekstensi berkas dari data URL gambar (untuk nama berkas lampiran). */
export function imageExtFromDataUrl(dataUrl: string): string {
  const mime = /^data:image\/([a-zA-Z0-9.+-]+);/.exec(dataUrl)?.[1]?.toLowerCase() ?? 'png';
  if (mime === 'jpeg') return 'jpg';
  if (mime === 'svg+xml') return 'svg';
  return mime.replace(/[^a-z0-9]/g, '') || 'png';
}
