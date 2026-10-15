/**
 * cliTerminalLocalizer.ts
 * Penerjemah cerdas real-time untuk output Terminal CLI (agy, opencode, claude, codex).
 * Mengubah loading proses, ringkasan berpikir, serta prompt pilihan opsi perizinan
 * ke dalam Bahasa Indonesia yang ramah bagi pengguna pemula maupun teknis.
 */

interface ReplacementRule {
  pattern: RegExp;
  replacement: string;
}

const LOCALIZATION_RULES: ReplacementRule[] = [
  // 1. Loading Proses & Reasoning Summaries
  { pattern: /\bThought for\b/g, replacement: 'Berpikir selama' },
  { pattern: /\bThinking\.\.\.\b/g, replacement: 'Sedang berpikir...' },
  { pattern: /\bRan (\d+) commands?\b/g, replacement: 'Menjalankan $1 perintah' },
  { pattern: /\bRan \(/g, replacement: 'Menjalankan (' },
  { pattern: /\bExplored (\d+) files?\b/g, replacement: 'Mengeksplorasi $1 berkas' },
  { pattern: /\(ctrl\+o to expand\)/g, replacement: '(ctrl+o untuk memperluas)' },
  { pattern: /\besc to cancel\b/g, replacement: 'esc: batalkan' },
  { pattern: /\besc to dismiss\b/g, replacement: 'esc: tutup box' },
  { pattern: /\bExited \/([a-zA-Z0-9_-]+) command\b/g, replacement: 'Keluar dari perintah /$1' },

  // Pemulihan kata-kata Bahasa Indonesia yang terpotong pada ringkasan pemikiran (thought preview)
  { pattern: /\bterlebi\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'terlebih dahulu...' },
  { pattern: /\bterlebih dahul\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'terlebih dahulu...' },
  { pattern: /\bsebagain\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'sebagainya...' },
  { pattern: /\bbeberap\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'beberapa...' },
  { pattern: /\bkebutuh\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'kebutuhan...' },
  { pattern: /\bpembangun\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'pembangunan...' },
  { pattern: /\bpengembang\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'pengembangan...' },
  { pattern: /\bkonfiguras\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'konfigurasi...' },
  { pattern: /\bpenjelas\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'penjelasan...' },
  { pattern: /\binformas\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'informasi...' },
  { pattern: /\bdirektor\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'direktori...' },
  { pattern: /\bprogr\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'program...' },
  { pattern: /\baplikas\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'aplikasi...' },
  { pattern: /\bperangk\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'perangkat...' },
  { pattern: /\blangkah-langk\b(?:[.\s]*\.\.\)|[.\s]*\.\.|\b)/g, replacement: 'langkah-langkah...' },

  // Pembersihan elipsis yang terpotong janggal / sisa titik pecah seperti ". ..)" -> "...)"
  { pattern: /\.\s+\.\.\)/g, replacement: '...)' },
  { pattern: /\.\s+\.\./g, replacement: '...' },
  { pattern: /\.\.\s*\.\)/g, replacement: '...)' },
  // Menghilangkan sisa baris baru yang hanya memuat sisa elipsis terpisah (orphan ghost line)
  { pattern: /\r?\n\s*(?:\.\.\)|\.\.\.|\.\.)(?=[\r\n]|$)/g, replacement: '' },

  // 2. Pilihan Opsi & Dialog Izin (Antigravity CLI, Codex, OpenCode, Claude)
  { pattern: /Requesting permission for:/g, replacement: 'Meminta izin eksekusi untuk:' },
  { pattern: /Run this command\?/g, replacement: 'Jalankan perintah ini?' },
  { pattern: /1\.\s+Yes, run command/g, replacement: '1. Ya, jalankan perintah' },
  {
    pattern: /2\.\s+Yes, and always allow in this conversation for commands that start with/g,
    replacement: '2. Ya, dan selalu izinkan di sesi ini untuk perintah berawalan',
  },
  {
    pattern: /3\.\s+Yes, and always allow for commands that start with/g,
    replacement: '3. Ya, dan selalu izinkan untuk perintah berawalan',
  },
  { pattern: /\(Persist to settings\.json\)/g, replacement: '(Simpan permanen ke settings.json)' },
  { pattern: /4\.\s+No, cancel/g, replacement: '4. Tidak, batalkan' },
  { pattern: /\bNo, cancel\b/g, replacement: 'Tidak, batalkan' },

  // Deduplikasi baris opsi batalkan jika buffer ConPTY me-redraw baris terbawah ganda
  // (escape sequence di antaranya sudah dimasking menjadi karakter placeholder, lihat maskEscapes)
  {
    pattern: /(4\.\s+(?:Tidak,\s+batalkan|No,\s+cancel))(?:\r?\n|\s|[-])*(?:\r?\n\s*)4\.\s+(?:Tidak,\s+batalkan|No,\s+cancel)/g,
    replacement: '$1',
  },

  // 3. Tombol Navigasi Pintasan
  { pattern: /↑\/↓ Navigate/g, replacement: '↑/↓ Navigasi' },
  { pattern: /tab Amend/g, replacement: 'tab Edit' },
  { pattern: /ctrl\+g edit\/expand command/g, replacement: 'ctrl+g edit/perluas' },

  // 4. Menu Ganti Model & Kuota
  { pattern: /\bSwitch Model\b/g, replacement: 'Ganti Model AI' },
  { pattern: /\bSearch:\s*\[\s*\]/g, replacement: 'Cari: [ ]' },
  { pattern: /\(current\)/g, replacement: '(model aktif)' },
  { pattern: /\bEffort\b/g, replacement: 'Tingkat Penalaran' },
  {
    pattern: /Deepest reasoning for complex problems\s*–\s*slower but strongest/g,
    replacement: 'Penalaran terdalam untuk masalah kompleks – lebih teliti & terkuat',
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

/**
 * Menerapkan satu aturan TANPA mengubah lebar tampilan. CLI agen (Claude, Codex, Antigravity) adalah TUI
 * yang menggambar ulang layar dengan posisi kursor relatif; teks yang memanjang/memendek menggeser kolom
 * sehingga sisa karakter lama tertinggal (mis. "vi1.", "ng3." di kolom awal).
 * Hasil lebih pendek diberi padding spasi; hasil lebih panjang atau yang mengubah baris dibatalkan.
 */
function applyWidthSafe(text: string, rule: ReplacementRule): string {
  const single = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', ''));
  return text.replace(rule.pattern, (match: string) => {
    const out = match.replace(single, rule.replacement);
    const before = visibleText(match);
    const after = visibleText(out);
    if (after === before) return out; // hanya pewarnaan
    const lines = (s: string) => s.split('\n').length;
    if (lines(after) !== lines(before) || /[\r\n]/.test(before)) return match;
    const diff = [...before].length - [...after].length;
    return diff >= 0 ? out + ' '.repeat(diff) : match;
  });
}

function applyRules(text: string): string {
  let translated = text;
  // 1. Terjemahkan loading, ringkasan, dan izin prompt
  for (const rule of LOCALIZATION_RULES) {
    translated = applyWidthSafe(translated, rule);
  }
  // 2. Percantik tampilan teks markdown, heading, pohon berkas & sintaks
  for (const rule of BEAUTIFY_RULES) {
    translated = applyWidthSafe(translated, rule);
  }
  return translated;
}

/**
 * Menerjemahkan potongan teks atau buffer ANSI stream dari PTY sekaligus
 * mempercantik formatting Markdown, heading, penomoran, dan kode.
 * Escape sequence di dalam chunk dijamin tidak diubah.
 */
export function localizeTerminalOutput(chunk: string): string {
  if (!chunk) return chunk;
  const m = maskEscapes(chunk);
  if (!m) return chunk;
  return unmaskEscapes(applyRules(m.masked), m.sequences);
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
