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
  {
    pattern: /(4\.\s+(?:Tidak,\s+batalkan|No,\s+cancel))(?:\r?\n|\s|\x1b\[[0-9;]*[a-zA-Z])*(?:\r?\n\s*)4\.\s+(?:Tidak,\s+batalkan|No,\s+cancel)/g,
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

  // 2. Nomor Urut List (1., 2., 3., dst.) - Diberi warna Kuning Emas / Amber Bold
  {
    pattern: /(^|\r?\n)(\s*)(\d+)\.\s+/g,
    replacement: '$1$2\x1b[1;38;2;251;191;36m$3.\x1b[0m ',
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
 * Menerjemahkan potongan teks atau buffer ANSI stream dari PTY sekaligus
 * mempercantik formatting Markdown, heading, penomoran, dan kode.
 */
export function localizeTerminalOutput(chunk: string): string {
  if (!chunk) return chunk;
  let translated = chunk;

  // 1. Terjemahkan loading, ringkasan, dan izin prompt
  for (const rule of LOCALIZATION_RULES) {
    translated = translated.replace(rule.pattern, rule.replacement);
  }

  // 2. Percantik tampilan teks markdown, heading, pohon berkas & sintaks
  for (const rule of BEAUTIFY_RULES) {
    translated = translated.replace(rule.pattern, rule.replacement);
  }

  return translated;
}
