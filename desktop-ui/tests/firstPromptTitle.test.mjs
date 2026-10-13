import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Logika ekstraksi judul dari input ketikan pertama pengguna
 */
function extractFirstPromptTitle(candidate) {
  if (!candidate) return null;

  // Bersihkan ANSI escape sequence dan karakter kontrol
  const cleanText = candidate
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();

  // Daftar perintah internal sistem yang tidak boleh dijadikan judul sesi
  const isSystemCmd =
    /^\/(clear|exit|quit|help|models|model|stats|cost|usage)\b/i.test(cleanText) ||
    /^(cls|clear|exit|quit|help|ls|dir)\b/i.test(cleanText);

  if (cleanText.length >= 3 && !isSystemCmd) {
    return cleanText.length > 60 ? cleanText.substring(0, 57) + '...' : cleanText;
  }

  return null;
}

/**
 * Logika pemilihan argumen default CLI per agent: OpenCode berjalan murni dengan antarmuka TUI aslinya
 */
function resolveAgentPtyArgs(_agentId, _targetBin, customArgs = []) {
  return [...customArgs];
}

test('First Prompt Title: Mengekstrak teks pertanyaan pengguna pertama menjadi judul sesi', () => {
  const rawInput = 'apakah diproject ini terdapat file readme?\r\n';
  const title = extractFirstPromptTitle(rawInput);
  assert.equal(title, 'apakah diproject ini terdapat file readme?');
});

test('First Prompt Title: Mengabaikan perintah sistem seperti /clear, /models, /stats', () => {
  assert.equal(extractFirstPromptTitle('/clear\r\n'), null);
  assert.equal(extractFirstPromptTitle('/models\r\n'), null);
  assert.equal(extractFirstPromptTitle('/stats\r\n'), null);
  assert.equal(extractFirstPromptTitle('cls\r\n'), null);
  assert.equal(extractFirstPromptTitle('exit\r\n'), null);
});

test('First Prompt Title: Memotong input yang sangat panjang menjadi maksimal 60 karakter dengan ellipsis', () => {
  const longPrompt = 'Tolong buatkan implementasi REST API CRUD lengkap menggunakan Spring Boot dan PostgreSQL dengan validasi bean dan OpenAPI documentation';
  const title = extractFirstPromptTitle(longPrompt);
  assert.ok(title);
  assert.ok(title.length <= 60);
  assert.ok(title.endsWith('...'));
});

test('OpenCode CLI Args: Menggunakan antarmuka TUI asli tanpa injeksi flag --mini', () => {
  const args1 = resolveAgentPtyArgs('opencode', 'C:\\Program Files\\nodejs\\opencode.exe', []);
  assert.deepEqual(args1, []);

  const args2 = resolveAgentPtyArgs('antigravity', 'C:\\Users\\aldis\\AppData\\Local\\agy\\bin\\agy.exe', []);
  assert.deepEqual(args2, []);
});
