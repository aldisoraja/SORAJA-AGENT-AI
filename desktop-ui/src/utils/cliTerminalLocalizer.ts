/**
 * cliTerminalLocalizer.ts
 * Penerjemah teks BAWAAN CLI di Terminal (agy, opencode, claude, codex): label proses ("Thought for",
 * "esc to cancel"), prompt izin, dan pintasan navigasi — ke Bahasa Indonesia.
 *
 * Isi jawaban & penalaran agen TIDAK PERNAH diubah: jawaban yang tampil adalah jawaban asli CLI.
 * Bahasa jawaban dijaga lewat aturan bahasa bawaan tiap CLI (`LANGUAGE_RULE`, specs/agent-protocols.md §5),
 * bukan lewat penerjemahan/perbaikan teks keluaran.
 *
 * Stream PTY langsung HANYA dilokalisasi (`localizeTerminalOutput`). Pewarnaan markdown
 * (`beautifyTerminalText`) tidak boleh dipakai pada output TUI: CLI agen sudah mewarnai sendiri,
 * dan `ESC[0m` sisipan mereset latar diff (merah/hijau) serta backtick kode ikut terhapus.
 */

interface ReplacementRule {
  pattern: RegExp;
  replacement: string;
}

/**
 * Placeholder escape sequence (lihat maskEscapes) yang boleh berada di antara kata label CLI,
 * mis. `↑/↓ESC[90m Navigate` atau `tabESC[90m Amend`. Ditangkap `$n` agar warnanya tetap utuh.
 */
const E = '([\uE000-\uF8FF]*)';
const rx = (s: TemplateStringsArray, ...v: string[]) => new RegExp(String.raw(s, ...v), 'g');

/**
 * Aturan terjemahan teks UI bawaan CLI. Diverifikasi terhadap stream PTY nyata agy 1.4, kiro-cli,
 * Claude Code, dan Codex 0.163 (16 Okt 2026). Syarat:
 * - Terjemahan tidak boleh lebih panjang dari aslinya (lihat applyWidthSafe).
 * - Label yang bisa DISUSUL teks lain di kolom absolut (agy merender diferensial: "Thought for 6s" lalu
 *   `ESC[9;17H, 631 tokens`; kotak "Search: [ ]" diisi ketikan) WAJIB sama lebar persis, tanpa padding.
 *   Padding hanya aman untuk baris yang selalu digambar utuh (dialog izin, footer pintasan, judul menu).
 * - Pola harus spesifik untuk label CLI: kata umum seperti "Effort", "(current)", atau "Ran (" tidak
 *   diterjemahkan karena bisa muncul di jawaban/kode asli agen.
 */
const LOCALIZATION_RULES: ReplacementRule[] = [
  // 1. Loading Proses & Reasoning Summaries (sama lebar)
  { pattern: /\bThought for (?=\d)/g, replacement: 'Waktu pikir ' },
  { pattern: /\bThinking\.\.\./g, replacement: 'Berpikir...' },
  { pattern: /\(ctrl\+o to expand\)/g, replacement: '(ctrl+o: buka isi)' },
  { pattern: /\besc to cancel\b/g, replacement: 'esc: batalkan' },
  { pattern: /\besc to dismiss\b/g, replacement: 'esc: tutup box' },
  { pattern: /\bExited \/([a-zA-Z0-9_-]+) command\b/g, replacement: 'Keluar dari /$1' },

  // 2. Dialog Izin (Antigravity CLI)
  { pattern: /Requesting permission for:/g, replacement: 'Meminta izin untuk:' },
  { pattern: /Run this command\?/g, replacement: 'Izinkan perintah?' },
  { pattern: /1\.(\s+)Yes, run command/g, replacement: '1.$1Ya, jalankan' },
  {
    pattern: /2\.(\s+)Yes, and always allow in this conversation for commands that start with/g,
    replacement: '2.$1Ya, dan selalu izinkan di sesi ini untuk perintah berawalan',
  },
  {
    pattern: /3\.(\s+)Yes, and always allow for commands that start with/g,
    replacement: '3.$1Ya, dan selalu izinkan untuk perintah berawalan',
  },
  { pattern: /\(Persist to settings\.json\)/g, replacement: '(Simpan ke settings.json)' },
  { pattern: /4\.(\s+)No, cancel/g, replacement: '4.$1Batalkan' },

  // 3. Tombol Navigasi Pintasan (tombol & labelnya dipisah escape warna)
  { pattern: rx`↑/↓${E} Navigate\b`, replacement: '↑/↓$1 Navigasi' },
  { pattern: rx`\btab${E} Amend\b`, replacement: 'tab$1 Edit' },
  { pattern: rx`ctrl\+g${E} edit/expand command`, replacement: 'ctrl+g$1 edit/perluas' },

  // 4. Menu Ganti Model
  { pattern: /\bSwitch Model\b/g, replacement: 'Ganti Model' },
  { pattern: /\bSearch:(?=\s*\[)/g, replacement: 'Cari:  ' },
  {
    pattern: /Deepest reasoning for complex problems\s*–\s*slower but strongest/g,
    replacement: 'Penalaran terdalam untuk masalah kompleks – paling teliti',
  },
];

/**
 * Aturan Pemercantik Visual Output Terminal (Beautifier & Highlighter):
 * Memberikan format ANSI TrueColor yang kaya, elegan & berstruktur seperti TUI OpenCode
 * untuk teks Markdown, heading, penomoran terstruktur, pohon berkas, inline code, dan istilah teknis.
 */
const BEAUTIFY_RULES: ReplacementRule[] = [
  // 1. Heading Markdown (Level 1, 2, 3, 4)
  {
    pattern: /(^|\r?\n)##\s+([^\r\n]+)/g,
    replacement: '$1\x1b[1;38;2;34;211;238m━━━ $2 ━━━\x1b[0m',
  },
  {
    pattern: /(^|\r?\n)###\s+([^\r\n]+)/g,
    replacement: '$1\x1b[1;38;2;56;189;248m◆ $2\x1b[0m',
  },
  {
    pattern: /(^|\r?\n)####\s+([^\r\n]+)/g,
    replacement: '$1\x1b[1;38;2;167;139;250m▸ $2\x1b[0m',
  },

  // 2. Nomor Urut List (1., 2., 3., dst.) - Diberi warna Kuning Emas / Amber Bold.
  // Spasi asli dipertahankan apa adanya: mengubah lebar baris membuat TUI (Claude/Codex) meninggalkan sisa karakter saat redraw.
  {
    pattern: /(^|\r?\n)([ \t]*)(\d+)\.([ \t]+)/g,
    replacement: '$1$2\x1b[1;38;2;251;191;36m$3.\x1b[0m$4',
  },

  // 3. Label Bagian Kunci (Teknologi:, Cara kerja:, Catatan:, Tips:, dsb.)
  {
    pattern: /(^|\r?\n)(\s*)(Teknologi|Cara kerja|Catatan|Tips|Langkah|Fungsi Proyek|Aturan|Struktur Proyek|Konfigurasi):/g,
    replacement: '$1$2\x1b[1;38;2;251;191;36m$3:\x1b[0m',
  },

  // 4. Anotasi Java / Framework (@Transactional, @RestController, @Service, dll.)
  {
    pattern: /(@[A-Z][a-zA-Z0-9_]+)/g,
    replacement: '\x1b[1;38;2;245;158;11m$1\x1b[0m',
  },

  // 5. Query SQL & Keyword Tipe Data Penting
  {
    pattern: /\b(SELECT[^\r\n]+?FOR UPDATE)\b/g,
    replacement: '\x1b[1;38;2;251;191;36m$1\x1b[0m',
  },
  {
    pattern: /\b(BigDecimal|String|Integer|Long|Boolean|Double|Float)\b/g,
    replacement: '\x1b[38;2;45;212;191m$1\x1b[0m',
  },

  // 6. Pohon Direktori (ASCII Tree: folder, garis pohon, dan komentar)
  {
    pattern: /((?:[├└│─]|\s{2,})\s+)([a-zA-Z0-9_.-]+\/)/g,
    replacement: '$1\x1b[1;38;2;56;189;248m$2\x1b[0m',
  },
  {
    pattern: /([├└]──|│)/g,
    replacement: '\x1b[38;2;94;114;142m$1\x1b[0m',
  },
  {
    pattern: /(#\s+[^\r\n]+)/g,
    replacement: '\x1b[38;2;148;163;184m$1\x1b[0m',
  },

  // 7. Nama File Ber-ekstensi (.java, .properties, .xml, .json, .ts, .tsx, .yml, .md)
  {
    pattern: /\b([a-zA-Z0-9_.-]+\.(?:java|properties|xml|json|ts|tsx|yml|yaml|sql|md))\b/g,
    replacement: '\x1b[38;2;52;211;153m$1\x1b[0m',
  },

  // 8. Inline Code Markdown (`referenceNumber`, `pom.xml`, dsb.)
  {
    pattern: /`([^`\r\n]+)`/g,
    replacement: '\x1b[1;38;2;52;211;153m$1\x1b[0m',
  },

  // 9. Teks Tebal (**teks**)
  {
    pattern: /\*\*([^*\r\n]+)\*\*/g,
    replacement: '\x1b[1;37m$1\x1b[0m',
  },

  // 10. Istilah Teknis dalam Tanda Kurung (Idempotency, Pessimistic Locking, dll.)
  {
    pattern: /\(([A-Z][a-zA-Z0-9_\s-]{2,35})\)/g,
    replacement: '(\x1b[38;2;56;189;248m$1\x1b[0m)',
  },
];

/**
 * Escape sequence ANSI utuh: CSI (`ESC [ … final`), OSC (`ESC ] … BEL|ST`), DCS/SOS/PM/APC (`ESC P|X|^|_ … ST`),
 * pemilih charset (`ESC ( B`), dan escape 2-karakter lainnya.
 */
const ANSI_SEQUENCE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[PX^_][^\x1b]*\x1b\\|[()*+][ -~]|(?![[\]PX^_])[ -~])/g;
/** Ekor chunk yang berupa escape sequence belum lengkap (terpotong di batas buffer PTY). */
const INCOMPLETE_TAIL = /^\x1b(?:\[[0-?]*[ -/]*|\][^\x07\x1b]*\x1b?|[PX^_][^\x1b]*\x1b?|[()*+])?$/;
/** Placeholder escape sequence: karakter Private Use Area (non-word, non-spasi) berindeks. */
const PUA_START = 0xe000;
const PUA_SIZE = 0xf8ff - PUA_START + 1;
const PUA_CHAR = /[-]/g;
/** Batas penahanan ekor tak lengkap; OSC rusak yang sangat panjang diteruskan apa adanya. */
const MAX_CARRY = 4096;

/**
 * Mengganti setiap escape sequence dengan placeholder PUA agar aturan regex tidak pernah
 * mencocokkan/menyisipkan teks DI DALAM sequence (mis. `ESC[1C` + nama berkas → "1C" bocor ke layar).
 * Mengembalikan null bila chunk tidak aman dimasking (sudah memuat karakter PUA, mis. ikon Nerd Font).
 */
function maskEscapes(chunk: string): { masked: string; sequences: string[] } | null {
  PUA_CHAR.lastIndex = 0;
  if (PUA_CHAR.test(chunk)) return null;
  const sequences: string[] = [];
  const masked = chunk.replace(ANSI_SEQUENCE, (seq) => {
    sequences.push(seq);
    return String.fromCharCode(PUA_START + ((sequences.length - 1) % PUA_SIZE));
  });
  return sequences.length > PUA_SIZE ? null : { masked, sequences };
}

function unmaskEscapes(text: string, sequences: string[]): string {
  return text.replace(PUA_CHAR, (ch) => sequences[ch.charCodeAt(0) - PUA_START] ?? '');
}

/** Teks yang benar-benar tampil di sel terminal (tanpa SGR sisipan & placeholder escape). */
function visibleText(s: string): string {
  return s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(PUA_CHAR, '');
}

/** Escape yang tidak menggerakkan kursor (warna SGR, OSC judul/hyperlink): teks setelahnya tetap di baris visual yang sama. */
const CURSOR_NEUTRAL = /^\x1b(?:\[[0-9;:]*m|\])/;

/**
 * Menerapkan satu aturan TANPA mengubah lebar tampilan. CLI agen (Claude, Codex, Antigravity) adalah TUI
 * yang menggambar ulang layar dengan posisi kursor relatif; teks yang memanjang/memendek menggeser kolom
 * sehingga sisa karakter lama tertinggal (mis. "vi1.", "ng3." di kolom awal).
 *
 * Hasil lebih panjang atau yang mengubah baris dibatalkan. Hasil lebih pendek diberi padding spasi di AKHIR
 * baris visualnya — sebelum baris baru atau escape yang menggerakkan kursor (SGR/OSC dilewati) — sehingga
 * kolom kursor tetap sama tanpa celah di tengah kalimat (bug "berawalan       'Get-ChildItem…'" dan
 * "Berpikir 6s   , 631 tokens" pada agy). Bila akhir baris tidak terlihat di chunk ini (chunk PTY terpotong
 * di tengah baris), terjemahan yang butuh padding dilewati: lebih baik tetap teks asli daripada rusak.
 */
function applyWidthSafe(text: string, rule: ReplacementRule, sequences: string[], wholeText: boolean): string {
  const lineEnd = (from: number): number => {
    for (let i = from; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\r' || ch === '\n') return i;
      const code = ch.charCodeAt(0);
      if (code >= PUA_START && code < PUA_START + PUA_SIZE && !CURSOR_NEUTRAL.test(sequences[code - PUA_START] ?? '')) {
        return i;
      }
    }
    return wholeText ? text.length : -1;
  };
  let out = '';
  let last = 0;
  let pad = { at: -1, count: 0 };
  const flushPad = (upTo: number) => {
    if (pad.count > 0 && pad.at <= upTo) {
      out += text.slice(last, pad.at) + ' '.repeat(pad.count);
      last = pad.at;
      pad = { at: -1, count: 0 };
    }
  };
  for (const m of text.matchAll(rule.pattern)) {
    const match = m[0];
    const start = m.index ?? 0;
    const end = start + match.length;
    // Substitusi `$n` dari match asli (bukan regex ulang pada potongan match: lookahead akan gagal).
    const replaced = rule.replacement.replace(/\$(\d)/g, (_, n: string) => m[Number(n)] ?? '');
    const before = visibleText(match);
    const after = visibleText(replaced);
    const lines = (s: string) => s.split('\n').length;
    if (after !== before && (lines(after) !== lines(before) || /[\r\n]/.test(before))) continue;
    const diff = [...before].length - [...after].length;
    if (diff < 0) continue;
    const at = diff > 0 ? lineEnd(end) : -1;
    if (diff > 0 && at === -1) continue;
    flushPad(start);
    let carried = 0;
    if (pad.count > 0) {
      // Akhir baris padding sebelumnya ada setelah match ini (baris yang sama): padding digabung.
      if (pad.at >= end) carried = pad.count;
      else {
        out += text.slice(last, start) + ' '.repeat(pad.count);
        last = start;
      }
      pad = { at: -1, count: 0 };
    }
    out += text.slice(last, start) + replaced;
    last = end;
    if (diff + carried > 0) pad = { at: at === -1 ? lineEnd(end) : at, count: diff + carried };
  }
  flushPad(text.length);
  return out + text.slice(last);
}

function applyRules(text: string, rules: ReplacementRule[], sequences: string[], wholeText: boolean): string {
  return rules.reduce((acc, rule) => applyWidthSafe(acc, rule, sequences, wholeText), text);
}

/** `wholeText`: teks utuh buatan Soraja (akhir teks = akhir baris), bukan potongan stream PTY. */
function transform(chunk: string, rules: ReplacementRule[], wholeText = false): string {
  if (!chunk) return chunk;
  const m = maskEscapes(chunk);
  if (!m) return chunk;
  return unmaskEscapes(applyRules(m.masked, rules, m.sequences, wholeText), m.sequences);
}

/**
 * Menerjemahkan potongan teks atau buffer ANSI stream dari PTY ke Bahasa Indonesia
 * tanpa mengubah warna maupun lebar tampilan. Escape sequence di dalam chunk dijamin tidak diubah.
 */
export function localizeTerminalOutput(chunk: string): string {
  return transform(chunk, LOCALIZATION_RULES);
}

/**
 * Mewarnai teks markdown polos (heading, penomoran, kode, pohon berkas) dengan ANSI.
 * Hanya untuk teks yang dihasilkan sendiri — JANGAN untuk stream TUI agen (lihat catatan di atas).
 */
export function beautifyTerminalText(text: string): string {
  return transform(text, BEAUTIFY_RULES, true);
}

/**
 * Localizer ber-state untuk satu stream PTY: escape sequence yang terpotong di akhir chunk
 * ditahan dan disambung ke chunk berikutnya, sehingga tidak pernah diproses sebagai teks biasa.
 */
export function createTerminalLocalizer(): (chunk: string) => string {
  let carry = '';
  return (chunk: string) => {
    let data = carry + chunk;
    carry = '';
    const esc = data.lastIndexOf('\x1b');
    if (esc !== -1 && data.length - esc <= MAX_CARRY && INCOMPLETE_TAIL.test(data.slice(esc))) {
      carry = data.slice(esc);
      data = data.slice(0, esc);
    }
    return localizeTerminalOutput(data);
  };
}
