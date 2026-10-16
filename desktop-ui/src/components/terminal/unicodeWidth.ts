/**
 * unicodeWidth.ts
 * Lebar karakter xterm.js disamakan dengan cara TUI CLI agen menghitungnya (string-width di Ink/Claude Code,
 * unicode-width di Codex, uniseg di Antigravity): emoji seperti ✅ ❌ 🚀 ⚠️ selebar 2 kolom.
 * Bawaan xterm (Unicode 6) menghitungnya 1 kolom, sehingga kursor CLI meleset di setiap baris berisi emoji
 * dan tabel/kotak TUI rusak (teks tumpang-tindih, garis tepi bergeser).
 */
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes';
import type { Terminal } from '@xterm/xterm';

/** Versi Unicode yang diaktifkan addon graphemes (lebar per kluster grafem, termasuk emoji + VS16/ZWJ). */
export const GRAPHEME_UNICODE_VERSION = '15-graphemes';

/** Membutuhkan `allowProposedApi: true`. Mengembalikan `false` bila addon gagal (tetap memakai Unicode 6). */
export function enableEmojiWidths(term: Pick<Terminal, 'loadAddon' | 'unicode'>): boolean {
  try {
    term.loadAddon(new UnicodeGraphemesAddon());
    return term.unicode.activeVersion === GRAPHEME_UNICODE_VERSION;
  } catch (err) {
    console.warn('Addon lebar emoji xterm gagal dimuat:', err);
    return false;
  }
}
