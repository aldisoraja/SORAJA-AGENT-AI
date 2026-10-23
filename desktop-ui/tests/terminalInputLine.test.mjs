import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInputLineTracker } from '../src/components/terminal/inputLineTracker.ts';

function track(chunks) {
  const lines = [];
  const feed = createInputLineTracker((line) => lines.push(line));
  for (const c of chunks) feed(c);
  return lines;
}

test('ketikan per karakter + Enter menjadi satu baris', () => {
  assert.deepEqual(track([...'halo dunia', '\r']), ['halo dunia']);
});

test('teks tempelan (bracketed paste) tetap terbaca (bug: judul memakai input ke-2)', () => {
  const pasted = '\x1b[200~Periksa seluruh kode aplikasi ini, deteksi jika ada error atau bug.\x1b[201~';
  assert.deepEqual(track([pasted, '\r']), ['Periksa seluruh kode aplikasi ini, deteksi jika ada error atau bug.']);
});

test('tempelan multi-baris: baris baru di dalam tempelan bukan Enter', () => {
  const lines = track(['\x1b[200~baris satu\r\nbaris dua\x1b[201~', '\r']);
  assert.deepEqual(lines, ['baris satu\n\nbaris dua']);
});

test('tempelan tanpa bracketed paste & ketikan lanjutan digabung', () => {
  assert.deepEqual(track(['cek ', 'bug', ' ini', '\r']), ['cek bug ini']);
});

test('escape sequence (panah, fokus) diabaikan; backspace, Ctrl+U & Ctrl+C mengedit baris', () => {
  assert.deepEqual(track(['\x1b[I', 'abx', '\x7f', 'c', '\x1b[D', '\x1bOA', '\r']), ['abc']);
  assert.deepEqual(track(['salah', '\x15', 'benar', '\r']), ['benar']);
  assert.deepEqual(track(['batal', '\x03', 'lanjut', '\r']), ['lanjut']);
});

test('Enter tanpa isi tidak melapor; tiap baris dilaporkan berurutan', () => {
  assert.deepEqual(track(['\r', 'satu\r', '  \r', 'dua\r']), ['satu', 'dua']);
});
