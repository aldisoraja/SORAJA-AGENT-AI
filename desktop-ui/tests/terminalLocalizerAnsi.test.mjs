import test from 'node:test';
import assert from 'node:assert/strict';
import { beautifyTerminalText, createTerminalLocalizer, localizeTerminalOutput } from '../src/utils/cliTerminalLocalizer.ts';

/** Semua escape sequence CSI di keluaran harus utuh (tidak ada ESC di tengah parameter CSI lain). */
const brokenCsi = /\x1b\[[0-?]*\x1b/;
const stripAnsi = (s) => s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');

test('ANSI: nama berkas setelah ESC[nC tidak memotong escape kursor (bug "1CEmbedded...tsx")', () => {
  const input = 'membaca\x1b[1CEmbeddedCliTerminal.tsx untuk';
  const out = localizeTerminalOutput(input);
  assert.ok(out.includes('\x1b[1C'), 'ESC[1C harus tetap utuh');
  assert.doesNotMatch(out, brokenCsi);
  assert.equal(stripAnsi(out), 'membacaEmbeddedCliTerminal.tsx untuk');
});

test('ANSI: posisi kursor ESC[r;cH sebelum nama berkas tetap utuh (bug "41HxtermThemes.ts")', () => {
  const out = localizeTerminalOutput('\x1b[12;41HxtermThemes.ts');
  assert.ok(out.startsWith('\x1b[12;41H'));
  assert.doesNotMatch(out, brokenCsi);
  assert.equal(stripAnsi(out), 'xtermThemes.ts');
});

test('ANSI: SGR warna & OSC judul tidak diubah, teks di sekitarnya tetap dilokalisasi', () => {
  const input = '\x1b]0;claude\x07\x1b[38;2;153;153;153m(esc to cancel)\x1b[39m';
  const out = localizeTerminalOutput(input);
  assert.ok(out.startsWith('\x1b]0;claude\x07\x1b[38;2;153;153;153m'));
  assert.match(out, /\(esc: batalkan\)/);
});

test('ANSI: angka parameter CSI tidak dianggap penomoran list', () => {
  const out = localizeTerminalOutput('\n\x1b[2K\x1b[1G1. langkah');
  assert.ok(out.includes('\x1b[2K\x1b[1G'));
  assert.doesNotMatch(out, brokenCsi);
});

test('Stream: escape sequence terpotong di batas chunk disambung sebelum diproses', () => {
  const localize = createTerminalLocalizer();
  const a = localize('halo \x1b[38;2;5');
  const b = localize('2;211mApp.tsx\x1b[0m selesai');
  const out = a + b;
  assert.equal(a, 'halo ', 'ekor escape tak lengkap ditahan');
  assert.ok(out.includes('\x1b[38;2;52;211m'), 'escape asli tersambung utuh');
  assert.doesNotMatch(out, brokenCsi);
  assert.equal(stripAnsi(out), 'halo App.tsx selesai');
});

test('Stream: ESC tunggal di akhir chunk ditahan, teks biasa tidak tertahan', () => {
  const localize = createTerminalLocalizer();
  assert.equal(localize('abc\x1b'), 'abc');
  assert.equal(localize('[1Cdef'), '\x1b[1Cdef');
  assert.equal(localize('tanpa escape'), 'tanpa escape');
});

test('Chunk berisi karakter Private Use Area (ikon Nerd Font) diteruskan apa adanya', () => {
  const input = ' \x1b[1Cfile.ts';
  assert.equal(localizeTerminalOutput(input), input);
});

test('Penomoran list hanya diwarnai: lebar baris & baris baru tidak berubah', () => {
  const input = '\r\n  4.  Mode safe\r\n5.\r\nlanjut';
  assert.equal(stripAnsi(localizeTerminalOutput(input)), input);
});

const width = (s) => [...stripAnsi(s)].length;

test('Lebar tetap: terjemahan yang memanjang dilewati (bug sisa "vi1." pada redraw TUI Claude)', () => {
  const input = '  │ Effort       │ --effort │';
  const out = localizeTerminalOutput(input);
  assert.equal(stripAnsi(out), input);
});

test('Lebar tetap: terjemahan sama panjang diterapkan, yang lebih pendek diberi padding di akhir run teks', () => {
  assert.equal(stripAnsi(localizeTerminalOutput('esc to cancel')), 'esc: batalkan');
  const out = localizeTerminalOutput('tab Amend|\x1b[K');
  assert.equal(out, 'tab Edit| \x1b[K', 'padding sebelum escape berikutnya, bukan di tengah teks');
  assert.equal(width(out), width('tab Amend|'));
  // Dua terjemahan dalam satu run: padding digabung di akhir run.
  assert.equal(localizeTerminalOutput('tab Amend · tab Amend\r\n'), 'tab Edit · tab Edit  \r\n');
});

test('Lebar tetap: penghapusan baris ganda tidak dilakukan di dalam TUI', () => {
  const input = '4. No, cancel\x1b[0m\r\n  4. No, cancel';
  // Kedua baris tetap ada; baris yang akhirnya belum terlihat di chunk ini tidak diterjemahkan (tanpa padding liar).
  assert.equal(stripAnsi(localizeTerminalOutput(input)), '4. Batalkan  \r\n  4. No, cancel');
});

test('Lebar tetap: heading markdown tidak diganti simbol yang lebih lebar', () => {
  const input = '\n## Ringkasan\n';
  assert.equal(stripAnsi(localizeTerminalOutput(input)), input);
});

test('Diff TUI: latar merah & backtick kode tidak diubah (bug blok merah terputus di diff Claude)', () => {
  const RED_BG = '\x1b[48;2;61;1;8m';
  const input = `${RED_BG}115 -    className={\`relative w-11 \${x}\`} // String foo.tsx (Idempotency)\x1b[K\x1b[0m`;
  const out = localizeTerminalOutput(input);
  assert.equal(out, input, 'baris diff harus diteruskan apa adanya');
  assert.ok(!out.slice(RED_BG.length, -4).includes('\x1b[0m'), 'tidak boleh ada reset SGR sisipan sebelum ESC[K');
});
