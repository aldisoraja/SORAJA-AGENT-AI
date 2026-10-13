import test from 'node:test';
import assert from 'node:assert/strict';

// Test the CLI Terminal Localization logic
const LOCALIZATION_RULES = [
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

  { pattern: /↑\/↓ Navigate/g, replacement: '↑/↓ Navigasi' },
  { pattern: /tab Amend/g, replacement: 'tab Edit' },
  { pattern: /ctrl\+g edit\/expand command/g, replacement: 'ctrl+g edit/perluas' },
  { pattern: /\bSwitch Model\b/g, replacement: 'Ganti Model AI' },
];

const BEAUTIFY_RULES = [
  { pattern: /(^|\r?\n)##\s+([^\r\n]+)/g, replacement: '$1\x1b[1;38;2;34;211;238m━━━ $2 ━━━\x1b[0m' },
  { pattern: /(^|\r?\n)###\s+([^\r\n]+)/g, replacement: '$1\x1b[1;38;2;56;189;248m◆ $2\x1b[0m' },
  { pattern: /(^|\r?\n)####\s+([^\r\n]+)/g, replacement: '$1\x1b[1;38;2;167;139;250m▸ $2\x1b[0m' },
  { pattern: /(^|\r?\n)(\s*)(\d+)\.\s+/g, replacement: '$1$2\x1b[1;38;2;251;191;36m$3.\x1b[0m ' },
  { pattern: /(^|\r?\n)(\s*)(Teknologi|Cara kerja|Catatan|Tips|Langkah|Fungsi Proyek|Aturan|Struktur Proyek|Konfigurasi):/g, replacement: '$1$2\x1b[1;38;2;251;191;36m$3:\x1b[0m' },
  { pattern: /(@[A-Z][a-zA-Z0-9_]+)/g, replacement: '\x1b[1;38;2;245;158;11m$1\x1b[0m' },
  { pattern: /\b(SELECT[^\r\n]+?FOR UPDATE)\b/g, replacement: '\x1b[1;38;2;251;191;36m$1\x1b[0m' },
  { pattern: /\b(BigDecimal|String|Integer|Long|Boolean|Double|Float)\b/g, replacement: '\x1b[38;2;45;212;191m$1\x1b[0m' },
  { pattern: /((?:[├└│─]|\s{2,})\s+)([a-zA-Z0-9_.-]+\/)/g, replacement: '$1\x1b[1;38;2;56;189;248m$2\x1b[0m' },
  { pattern: /([├└]──|│)/g, replacement: '\x1b[38;2;94;114;142m$1\x1b[0m' },
  { pattern: /(#\s+[^\r\n]+)/g, replacement: '\x1b[38;2;148;163;184m$1\x1b[0m' },
  { pattern: /\b([a-zA-Z0-9_.-]+\.(?:java|properties|xml|json|ts|tsx|yml|yaml|sql|md))\b/g, replacement: '\x1b[38;2;52;211;153m$1\x1b[0m' },
  { pattern: /`([^`\r\n]+)`/g, replacement: '\x1b[1;38;2;52;211;153m$1\x1b[0m' },
  { pattern: /\*\*([^*\r\n]+)\*\*/g, replacement: '\x1b[1;37m$1\x1b[0m' },
  { pattern: /\(([A-Z][a-zA-Z0-9_\s-]{2,35})\)/g, replacement: '(\x1b[38;2;56;189;248m$1\x1b[0m)' },
];

function localizeTerminalOutput(chunk) {
  if (!chunk) return chunk;
  let translated = chunk;
  for (const rule of LOCALIZATION_RULES) {
    translated = translated.replace(rule.pattern, rule.replacement);
  }
  for (const rule of BEAUTIFY_RULES) {
    translated = translated.replace(rule.pattern, rule.replacement);
  }
  return translated;
}

function getSlashConfig(agentId) {
  switch (agentId) {
    case 'opencode':
      return {
        modelCmd: '/models\r',
        modelLabel: 'Pilih Model (/models)',
        usageCmd: '/stats\r',
        usageLabel: 'Cek Kuota (/stats)',
      };
    case 'claude':
      return {
        modelCmd: '/model\r',
        modelLabel: 'Ganti Model (/model)',
        usageCmd: '/cost\r',
        usageLabel: 'Cek Kuota (/cost)',
      };
    case 'codex':
      return {
        modelCmd: '/model\r',
        modelLabel: 'Ganti Model (/model)',
        usageCmd: '/status\r',
        usageLabel: 'Cek Kuota (/status)',
      };
    case 'antigravity':
    case 'agy':
    default:
      return {
        modelCmd: '/model\r',
        modelLabel: 'Ganti Model (/model)',
        usageCmd: '/usage\r',
        usageLabel: 'Cek Kuota (/usage)',
      };
  }
}

test('CLI Localization: Translates loading and reasoning summaries into Indonesian', () => {
  const input = 'o Thought for 5.7s (analyzing files)\n• Ran (dir) (ctrl+o to expand)\n• Explored 1 file';
  const output = localizeTerminalOutput(input);
  assert.match(output, /Berpikir selama 5\.7s/);
  assert.match(output, /Menjalankan \(dir\)/);
  assert.match(output, /\(ctrl\+o untuk memperluas\)/);
  assert.match(output, /Mengeksplorasi 1 berkas/);
});

test('CLI Localization: Translates permission prompt and option choices into Indonesian', () => {
  const input = `Requesting permission for:
  dir
Run this command?
> 1. Yes, run command
  2. Yes, and always allow in this conversation for commands that start with 'dir'
  3. Yes, and always allow for commands that start with 'dir' (Persist to settings.json)
  4. No, cancel
↑/↓ Navigate • tab Amend • ctrl+g edit/expand command`;

  const output = localizeTerminalOutput(input);
  assert.match(output, /Meminta izin eksekusi untuk:/);
  assert.match(output, /Jalankan perintah ini\?/);
  assert.match(output, /1\.(?:\x1b\[0m)?\s+Ya, jalankan perintah/);
  assert.match(output, /2\.(?:\x1b\[0m)?\s+Ya, dan selalu izinkan di sesi ini untuk perintah berawalan/);
  assert.match(output, /3\.(?:\x1b\[0m)?\s+Ya, dan selalu izinkan untuk perintah berawalan 'dir'/);
  assert.match(output, /4\.(?:\x1b\[0m)?\s+Tidak, batalkan/);
  assert.match(output, /↑\/↓ Navigasi • tab Edit • ctrl\+g edit\/perluas/);
});

test('Slash Commands per Agent: Correct commands & labels are tailored for each CLI engine', () => {
  const agyCfg = getSlashConfig('antigravity');
  assert.equal(agyCfg.modelCmd, '/model\r');
  assert.equal(agyCfg.usageCmd, '/usage\r');
  assert.equal(agyCfg.usageLabel, 'Cek Kuota (/usage)');

  const opencodeCfg = getSlashConfig('opencode');
  assert.equal(opencodeCfg.modelCmd, '/models\r');
  assert.equal(opencodeCfg.modelLabel, 'Pilih Model (/models)');
  assert.equal(opencodeCfg.usageCmd, '/stats\r');
  assert.equal(opencodeCfg.usageLabel, 'Cek Kuota (/stats)');

  const claudeCfg = getSlashConfig('claude');
  assert.equal(claudeCfg.modelCmd, '/model\r');
  assert.equal(claudeCfg.usageCmd, '/cost\r');
  assert.equal(claudeCfg.usageLabel, 'Cek Kuota (/cost)');

  const codexCfg = getSlashConfig('codex');
  assert.equal(codexCfg.modelCmd, '/model\r');
  assert.equal(codexCfg.usageCmd, '/status\r');
  assert.equal(codexCfg.usageLabel, 'Cek Kuota (/status)');
});

test('CLI Beautifier: Enhances Markdown headings, lists, annotations, and tree directory structure with ANSI styling', () => {
  const sampleAgy = `### 1. Proyek Utama: bank-transfer-service
#### Fungsi Proyek
1. Pencegahan Transaksi Ganda (Idempotency): Memeriksa \`referenceNumber\` unik.
2. Transaksi Atomik (@Transactional): Jika terjadi kegagalan, rollback otomatis.
bank-transfer-service/
 ├── config/          # Inisialisasi awal aplikasi
 └── service/         # Logika bisnis inti`;

  const output = localizeTerminalOutput(sampleAgy);

  // Verifikasi heading dihiasi simbol dan warna
  assert.match(output, /◆ 1\. Proyek Utama: bank-transfer-service/);
  assert.match(output, /▸ Fungsi Proyek/);

  // Verifikasi nomor urut dihiasi warna
  assert.match(output, /\x1b\[1;38;2;251;191;36m1\.\x1b\[0m /);
  assert.match(output, /\x1b\[1;38;2;251;191;36m2\.\x1b\[0m /);

  // Verifikasi inline code & anotasi
  assert.match(output, /\x1b\[1;38;2;52;211;153mreferenceNumber\x1b\[0m/);
  assert.match(output, /\x1b\[1;38;2;245;158;11m@Transactional\x1b\[0m/);

  // Verifikasi istilah teknis dalam kurung
  assert.match(output, /\(\x1b\[38;2;56;189;248mIdempotency\x1b\[0m\)/);

  // Verifikasi folder dan komentar pohon direktori
  assert.match(output, /\x1b\[1;38;2;56;189;248mconfig\/\x1b\[0m/);
  assert.match(output, /\x1b\[38;2;148;163;184m# Inisialisasi awal aplikasi\x1b\[0m/);
});

test('CLI Localization: Recovers truncated thought words and removes broken ellipsis orphan lines', () => {
  const input = 'o Thought for 5.5s (Akan saya coba untuk memberikan penjelasan sederhana mengenai proyek ini. Perlu melihat isi direktori kerja terlebi. ..)\r\n..)';
  const output = localizeTerminalOutput(input);

  // Kata "terlebi" terpulihkan menjadi "terlebih dahulu"
  assert.match(output, /terlebih dahulu/);
  // Tidak ada elipsis terpisah yang janggal ". ..)"
  assert.doesNotMatch(output, /\.\s+\.\.\)/);
  // Sisa elipsis orphan "..)" di baris baru harus bersih
  assert.doesNotMatch(output, /\r?\n\s*\.\.\)/);
});

test('CLI Localization: Deduplicates ghost line option 4 from ConPTY redraw', () => {
  const input = `Requesting permission for:
  dir
Run this command?
  1. Yes, run command
  2. Yes, and always allow in this conversation for commands that start with 'dir'
  3. Yes, and always allow for commands that start with 'dir' (Persist to settings.json)
  4. No, cancel
  4. No, cancel`;

  const output = localizeTerminalOutput(input);
  const occurrences = (output.match(/4\.(?:\x1b\[0m)?\s+Tidak,\s+batalkan/g) || []).length;
  assert.equal(occurrences, 1, 'Pilihan "4. Tidak, batalkan" tidak boleh muncul lebih dari 1 kali');
});

