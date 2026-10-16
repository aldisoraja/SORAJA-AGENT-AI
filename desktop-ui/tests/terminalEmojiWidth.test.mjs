/**
 * Regresi: tabel jawaban agen di Terminal rusak bila baris berisi emoji (✅ ⚠️ ❌ 🚀).
 * TUI CLI (Ink/Claude Code, Codex, Antigravity, Kiro) menghitung emoji selebar 2 kolom dan menggambar ulang
 * sebagian baris dengan memindah kursor ke kolom absolut (`ESC[<n>G`). xterm.js bawaan (Unicode 6) menghitungnya
 * 1 kolom, sehingga tulisan berikutnya mendarat di sel yang salah (teks bertumpuk, garis tepi tabel bergeser).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import xtermHeadless from '@xterm/headless';
import { enableEmojiWidths, GRAPHEME_UNICODE_VERSION } from '../src/components/terminal/unicodeWidth.ts';

const { Terminal } = xtermHeadless;

function makeTerm(withEmojiWidths) {
  const term = new Terminal({ cols: 60, rows: 6, allowProposedApi: true });
  if (withEmojiWidths) assert.equal(enableEmojiWidths(term), true);
  return term;
}

const write = (term, data) => new Promise((resolve) => term.write(data, resolve));
const row = (term, y) => term.buffer.active.getLine(y).translateToString(true);

/** Baris tabel lalu gambar ulang kolom kanan seperti renderer diferensial TUI (kolom dihitung dengan lebar CLI). */
async function renderRow(term, cell, rightColumn) {
  await write(term, `│${cell}│ lama`);
  await write(term, `\x1b[${rightColumn}G│ baru`);
  return row(term, 0);
}

test('lebar emoji = 2 kolom seperti TUI CLI (✅ ❌ 🚀 ⚠️ ℹ️, grafem ZWJ/skin tone tetap 2)', async () => {
  const term = makeTerm(true);
  assert.equal(term.unicode.activeVersion, GRAPHEME_UNICODE_VERSION);
  for (const [text, width] of [['✅', 2], ['❌', 2], ['🚀', 2], ['⚠️', 2], ['ℹ️', 2], ['👨‍💻', 2], ['👍🏽', 2], ['│', 1], ['中文', 4]]) {
    await write(term, '\x1b[H\x1b[2K' + text);
    assert.equal(term.buffer.active.cursorX, width, `lebar ${text}`);
  }
});

test('tabel berisi emoji tetap rapi saat CLI menggambar ulang kolom kanan', async () => {
  // "│" + "✅"(2) + " Ya, didukung resmi "(20) → garis tepi kanan di kolom 24 (1-based) menurut CLI.
  const fixed = await renderRow(makeTerm(true), '✅ Ya, didukung resmi ', 24);
  assert.equal(fixed, '│✅ Ya, didukung resmi │ baru');
  const warn = await renderRow(makeTerm(true), '⚠️ Kemungkinan tidak ada ', 27);
  assert.equal(warn, '│⚠️ Kemungkinan tidak ada │ baru');

  // Tanpa addon (perilaku lama): garis tepi lama tertinggal dan tulisan baru bergeser satu kolom.
  const broken = await renderRow(makeTerm(false), '✅ Ya, didukung resmi ', 24);
  assert.notEqual(broken, fixed);
});
