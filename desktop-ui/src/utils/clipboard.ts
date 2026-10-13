/**
 * clipboard.ts
 * Menyalin teks ke clipboard dengan fallback `execCommand` bila Clipboard API ditolak (mis. webview tanpa fokus),
 * serta menyalin gambar sebagai data biner PNG.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // jatuh ke fallback di bawah
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Mengubah gambar apa pun (JPEG, WebP, SVG, …) menjadi PNG lewat canvas — Clipboard API WebView hanya menerima PNG. */
async function toPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmapUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = bitmapUrl;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')?.drawImage(img, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Konversi gambar ke PNG gagal.');
    return png;
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/**
 * Menyalin gambar (sebagai data biner PNG, bukan URL) ke clipboard sistem.
 * Mengembalikan `false` bila webview/browser menolak izin clipboard atau gambar tidak dapat dibaca.
 */
export async function copyImageToClipboard(imageUrl: string): Promise<boolean> {
  if (!imageUrl || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return false;
    const png = await toPngBlob(await res.blob());
    await navigator.clipboard.write([new ClipboardItem({ [png.type]: png })]);
    return true;
  } catch (err) {
    console.warn('Gagal menyalin gambar ke clipboard:', err);
    return false;
  }
}
