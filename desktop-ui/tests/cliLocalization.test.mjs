/**
 * Lokalisasi Terminal CLI — menguji MODUL ASLI (bukan salinan aturan).
 * Prinsip: jawaban & penalaran agen tampil apa adanya (jawaban asli CLI); hanya teks bawaan CLI
 * yang lebarnya muat yang diterjemahkan. Bahasa jawaban dijaga oleh LANGUAGE_RULE, bukan oleh penerjemah.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { beautifyTerminalText, createTerminalLocalizer, localizeTerminalOutput } from '../src/utils/cliTerminalLocalizer.ts';
import { getSlashConfig } from '../src/components/terminal/slashConfig.ts';

const stripAnsi = (s) => s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');

test('Jawaban asli CLI: teks jawaban berbahasa Indonesia tidak diubah sedikit pun', () => {
  const answers = [
    'Saya akan melihat isi direktori kerja terlebih dahulu.',
    // Kata yang sah tidak boleh "dipulihkan" menjadi kata lain (bug aturan lama: pengembang → pengembangan...)
    'Tim pengembang dan pembangun aplikasi sudah menyiapkan konfigurasi.',
    'Langkah berikutnya: jalankan `npm test` lalu periksa hasilnya. ..)',
    'Daftar:\n1. Baca berkas\n2. Ubah kode\n..)',
  ];
  for (const a of answers) assert.equal(localizeTerminalOutput(a), a);
});

test('Jawaban asli CLI: jawaban berbahasa Inggris juga diteruskan apa adanya (tidak diterjemahkan)', () => {
  const a = 'This is an intended behavior change: WebFetch now gets its own "web" category. No, cancel is not needed.';
  assert.equal(localizeTerminalOutput(a), a);
});

test('Kata umum di jawaban/kode asli agen tidak ikut diterjemahkan', () => {
  for (const s of ['setValue(current)\r\n', 'Effort estimation\r\n', 'Ran (quickly)\r\n', 'I thought for a while\r\n', 'No, cancel it\r\n']) {
    assert.equal(localizeTerminalOutput(s), s);
  }
});

test('Teks bawaan CLI yang muat lebarnya tetap diterjemahkan', () => {
  assert.equal(localizeTerminalOutput('esc to cancel'), 'esc: batalkan');
  assert.equal(localizeTerminalOutput('↑/↓ Navigate • tab Amend\r\n'), '↑/↓ Navigasi • tab Edit \r\n');
});

test('Dialog izin agy (stream nyata) diterjemahkan utuh: tidak campur Inggris, tidak ada celah spasi di tengah kalimat', () => {
  const input =
    '\x1b[1m\x1b[25;1HRequesting permission for:\x1b[22m\r\n   Get-ChildItem\x1b[m\x1b[1m\x1b[27;1HRun this command?\x1b[94m\x1b[22m\r\n' +
    "> 1. Yes, run command\r\n  2. Yes, and always allow in this conversation for commands that start with 'Get-ChildItem'\r\n" +
    '  4. No, cancel\x1b[K\r\n';
  const out = localizeTerminalOutput(input);
  const plain = stripAnsi(out);
  assert.match(plain, /Meminta izin untuk:/);
  assert.match(plain, /Izinkan perintah\?/);
  assert.match(plain, /> 1\. Ya, jalankan {4}\r\n/);
  assert.match(plain, /perintah berawalan 'Get-ChildItem' {12}\r\n/, 'padding di akhir baris, bukan sebelum argumen');
  assert.match(plain, / {2}4\. Batalkan {2}\r\n/);
  assert.doesNotMatch(plain, /Yes|No, cancel|Run this/);
  // Lebar tiap baris tetap sama → posisi kursor TUI tidak bergeser.
  const widths = (s) => stripAnsi(s).split('\n').map((l) => [...l].length);
  assert.deepEqual(widths(out), widths(input));
});

test('Label CLI yang dipisah escape warna tetap diterjemahkan dan warnanya utuh (stream nyata agy)', () => {
  const input = '  \x1b[94m\x1b[1m↑/↓\x1b[90m\x1b[22m Navigate · \x1b[94m\x1b[1mtab\x1b[90m\x1b[22m Amend\x1b[K';
  assert.equal(
    localizeTerminalOutput(input),
    '  \x1b[94m\x1b[1m↑/↓\x1b[90m\x1b[22m Navigasi · \x1b[94m\x1b[1mtab\x1b[90m\x1b[22m Edit \x1b[K'
  );
  assert.equal(localizeTerminalOutput('Thinking... \x1b[38;2;1;1;1m(esc to cancel)'), 'Berpikir... \x1b[38;2;1;1;1m(esc: batalkan)');
});

test('Render diferensial agy: label yang disusul teks di kolom absolut diterjemahkan sama lebar (bug "Berpikir 6s   , 631 tokens")', () => {
  // agy menulis "▸ Thought for 6s", lalu menambahkan ", 631 tokens" di ESC[9;17H (tepat setelah "6s").
  const out = localizeTerminalOutput('\x1b[9;1H▸ Thought for 6s\x1b[K') + localizeTerminalOutput('\x1b[9;17H, 631 tokens');
  assert.equal(stripAnsi(out), '▸ Waktu pikir 6s, 631 tokens');
  assert.equal(localizeTerminalOutput('● Ran (git diff) (ctrl+o to expand)'), '● Ran (git diff) (ctrl+o: buka isi)');
  // Kotak pencarian diisi ketikan di kolom tetap: posisi "[" tidak boleh bergeser.
  assert.equal(localizeTerminalOutput('Search: [ ]').indexOf('['), 'Search: [ ]'.indexOf('['));
});

test('Baris yang digambar utuh: terjemahan lebih pendek diberi padding di akhir baris (SGR dilewati)', () => {
  assert.equal(
    localizeTerminalOutput('  \x1b[1mtab\x1b[22m Amend\x1b[90m · enter\r\n'),
    '  \x1b[1mtab\x1b[22m Edit\x1b[90m · enter \r\n'
  );
});

test('Chunk PTY terpotong di tengah baris: terjemahan yang butuh padding dilewati, bukan menyisipkan celah', () => {
  const localize = createTerminalLocalizer();
  const a = localize('  tab Amend · ctrl+g edit/expand comm');
  const b = localize('and\x1b[K');
  assert.equal(a + b, '  tab Amend · ctrl+g edit/expand command\x1b[K');
  // Terjemahan sama lebar tetap aman diterapkan walau baris terpotong.
  assert.equal(localize('○ Thought for 38.1s (Initial code review confirms simple arith'), '○ Waktu pikir 38.1s (Initial code review confirms simple arith');
});

test('Teks bawaan CLI yang terpotong hard-wrap di tengah frasa diteruskan apa adanya', () => {
  const s = '(Persist to\r\nsettings.json)';
  assert.equal(localizeTerminalOutput(s), s);
});

test('Slash command per agen sesuai slashConfig.ts', () => {
  assert.deepEqual(
    ['antigravity', 'opencode', 'claude', 'codex', 'kiro'].map((id) => [getSlashConfig(id).modelCmd, getSlashConfig(id).usageCmd]),
    [
      ['/model\r', '/usage\r'],
      ['/models\r', '/stats\r'],
      ['/model\r', '/usage\r'],
      ['/model\r', '/status\r'],
      ['/model\r', '/usage\r'],
    ]
  );
});

test('beautifyTerminalText (khusus teks buatan Soraja): heading, nomor, dan inline code diwarnai tanpa mengubah kata', () => {
  const out = beautifyTerminalText('1. Pakai `referenceNumber` (Idempotency)');
  assert.match(out, /\x1b\[1;38;2;251;191;36m1\.\x1b\[0m /);
  assert.match(out, /referenceNumber/);
  // Backtick diganti spasi agar lebar baris tetap; kata-katanya sendiri tidak berubah.
  assert.equal(out.replace(/\x1b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').trim(), '1. Pakai referenceNumber (Idempotency)');
});
