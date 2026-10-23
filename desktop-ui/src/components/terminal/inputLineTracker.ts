/**
 * inputLineTracker.ts
 * Merekonstruksi baris yang dikirim pengguna ke CLI dari aliran `term.onData` xterm (ketikan & teks tempelan).
 * Dipakai untuk memberi judul sesi CLI dari input pertama.
 */

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

/** Panjang escape sequence di `data[i]` (CSI `ESC [ … final`, SS3 `ESC O x`, atau `ESC x` untuk Alt+tombol). */
function escapeLength(data: string, i: number): number {
  const next = data[i + 1];
  if (next === '[') {
    let j = i + 2;
    while (j < data.length && !(data.charCodeAt(j) >= 0x40 && data.charCodeAt(j) <= 0x7e)) j++;
    return Math.min(j + 1, data.length) - i;
  }
  if (next === 'O') return Math.min(3, data.length - i);
  return next === undefined ? 1 : 2;
}

/**
 * Mengembalikan pengumpan `onData`: setiap Enter memanggil `onLine` dengan baris yang terkumpul.
 * Teks tempelan dibungkus bracketed paste (`ESC[200~ … ESC[201~`) saat CLI mengaktifkannya; isinya tetap
 * dihitung, dan baris baru di dalam tempelan bukan Enter. Escape sequence lain (panah, fokus) diabaikan.
 */
export function createInputLineTracker(onLine: (line: string) => void): (data: string) => void {
  let buffer = '';
  let pasting = false;
  return (data) => {
    let i = 0;
    while (i < data.length) {
      if (data.startsWith(PASTE_START, i)) {
        pasting = true;
        i += PASTE_START.length;
        continue;
      }
      if (data.startsWith(PASTE_END, i)) {
        pasting = false;
        i += PASTE_END.length;
        continue;
      }
      const ch = data[i];
      if (ch === '\x1b') {
        i += escapeLength(data, i);
        continue;
      }
      i++;
      if (ch === '\r' || ch === '\n') {
        if (pasting) {
          buffer += '\n';
          continue;
        }
        const line = buffer.trim();
        buffer = '';
        if (line) onLine(line);
      } else if (ch === '\x7f' || ch === '\b') {
        buffer = buffer.slice(0, -1);
      } else if (ch === '\x03' || ch === '\x15') {
        buffer = ''; // Ctrl+C / Ctrl+U mengosongkan baris di CLI
      } else if (ch >= ' ' || ch === '\t') {
        buffer += ch;
      }
    }
  };
}
