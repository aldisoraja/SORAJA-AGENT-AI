/**
 * Penyesuaian warna output CLI untuk tema terang.
 *
 * CLI agen (mis. Claude Code) menggambar diff memakai latar truecolor yang dirancang untuk terminal
 * gelap (merah/hijau tua, abu gelap). Di latar terang hasilnya berat dan teksnya sulit dibaca.
 * Fungsi di sini menulis ulang parameter SGR latar `48;2;r;g;b` yang gelap menjadi tint terang
 * dengan hue yang sama. Hanya nilai warna yang berubah, jadi tata letak TUI tidak terpengaruh.
 * Kontras warna teks ditangani xterm lewat `minimumContrastRatio`.
 */

const SGR_RE = /\x1b\[([0-9;]*)m/g;

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Latar gelap → tint terang dengan hue sama; latar yang sudah terang dibiarkan. */
function lightenBackground(r: number, g: number, b: number): [number, number, number] | null {
  const lum = luminance(r, g, b);
  if (lum > 0.4) return null;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Abu/hitam (mis. baris prompt pengguna): abu kebiruan lembut ala slate-200.
  if (max - min < 24) return [226, 232, 240];
  // Normalisasi ke kecerahan penuh untuk mempertahankan hue, lalu campur dengan putih.
  // Latar asli yang lebih terang (sorotan kata dalam diff) → tint sedikit lebih pekat.
  const strength = 0.16 + lum * 1.2;
  const mix = (c: number) => Math.round(255 - (255 - (c * 255) / max) * strength);
  return [mix(r), mix(g), mix(b)];
}

function rewriteParams(params: string): string {
  const parts = params.split(';');
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i];
    if ((code === '38' || code === '58') && parts[i + 1] === '2') {
      i += 4; // lewati warna teks/garis bawah truecolor
    } else if ((code === '38' || code === '48' || code === '58') && parts[i + 1] === '5') {
      i += 2; // lewati warna 256
    } else if (code === '48' && parts[i + 1] === '2' && i + 4 < parts.length) {
      const rgb = lightenBackground(Number(parts[i + 2]), Number(parts[i + 3]), Number(parts[i + 4]));
      if (rgb) [parts[i + 2], parts[i + 3], parts[i + 4]] = rgb.map(String);
      i += 4;
    }
  }
  return parts.join(';');
}

/** Terapkan pada chunk output PTY yang escape sequence-nya sudah utuh (setelah localizer). */
export function adaptOutputForLightTheme(data: string): string {
  if (!data.includes('48;2;')) return data;
  return data.replace(SGR_RE, (seq, params: string) =>
    params.includes('48;2;') ? `\x1b[${rewriteParams(params)}m` : seq
  );
}
