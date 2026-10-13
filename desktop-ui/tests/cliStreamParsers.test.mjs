import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStreamParser } from '../src/services/cli/streamParsers.ts';

// Fixture = output NDJSON asli dari CLI terpasang (path lokal sudah disamarkan).
function run(agentId, fixture) {
  const parse = createStreamParser(agentId);
  const lines = readFileSync(new URL(`./fixtures/${fixture}`, import.meta.url), 'utf8').split('\n');
  return lines.flatMap((l) => parse(l));
}

const kinds = (events, kind) => events.filter((e) => e.kind === kind);
const text = (events) => kinds(events, 'text').map((e) => e.delta).join('');

test('claude: session, tool, file_change, teks, usage, done', () => {
  const ev = run('claude', 'claude.ndjson');
  assert.equal(kinds(ev, 'session')[0].cliSessionId, 'd8f37d0c-e21a-4d8a-80c5-ef3806a36a14');
  assert.deepEqual(kinds(ev, 'file_change').map((e) => e.path), ['C:\\work\\demo\\hello.txt']);
  const bash = kinds(ev, 'tool').filter((e) => e.name === 'Bash');
  assert.deepEqual(bash.map((e) => e.status), ['running', 'done']);
  assert.equal(bash[1].output, 'selesai');
  assert.match(text(ev), /hello\.txt/);
  assert.ok(kinds(ev, 'usage')[0].costUsd > 0);
  assert.deepEqual(kinds(ev, 'done'), [{ kind: 'done', ok: true, summary: undefined }]);
});

test('codex: thread_id, command_execution, pesan digabung, done', () => {
  const ev = run('codex', 'codex.ndjson');
  assert.equal(kinds(ev, 'session')[0].cliSessionId, '01a12e03-fe18-7111-9a6d-b9d2f3c0cce8');
  const shell = kinds(ev, 'tool');
  assert.deepEqual(shell.map((e) => e.status), ['running', 'done']);
  assert.match(shell[1].output, /selesai/);
  assert.match(text(ev), /\n\nFile `hello\.txt`/);
  assert.equal(kinds(ev, 'usage')[0].outputTokens, 124);
  assert.equal(kinds(ev, 'done')[0].ok, true);
});

test('codex: sesi yang perintahnya diblokir tetap selesai dengan teks penjelasan', () => {
  const ev = run('codex', 'codex-blocked.ndjson');
  assert.match(text(ev), /ditolak/);
  assert.equal(kinds(ev, 'tool').length, 0);
});

test('opencode: sessionID sekali, tool error lalu sukses, file_change, usage per step', () => {
  const ev = run('opencode', 'opencode.ndjson');
  assert.equal(kinds(ev, 'session').length, 1);
  const writes = kinds(ev, 'tool').filter((e) => e.name === 'write');
  assert.deepEqual(writes.map((e) => e.status), ['error', 'done']);
  assert.deepEqual(kinds(ev, 'file_change').map((e) => e.path), ['C:\\work\\demo\\hello.txt']);
  assert.match(text(ev), /hello\.txt/);
  assert.ok(kinds(ev, 'usage').length >= 2);
});

test('antigravity: text_delta di-stream, tidak digandakan oleh result.response', () => {
  const ev = run('antigravity', 'antigravity.ndjson');
  assert.equal(kinds(ev, 'session')[0].cliSessionId, '76258710-7707-4a1c-b87d-468440fc471c');
  assert.equal(
    text(ev),
    'Rust adalah bahasa pemrograman sistem yang dirancang untuk memberikan performa tinggi serta keamanan memori tanpa memerlukan *garbage collector*.\n'
  );
  assert.equal(kinds(ev, 'done')[0].ok, true);
});

test('antigravity: aksi yang ditolak di mode aman memunculkan notice', () => {
  const ev = run('antigravity', 'antigravity-denied.ndjson');
  assert.deepEqual(kinds(ev, 'file_change').map((e) => e.path), ['C:\\work\\demo\\hello.txt']);
  assert.match(kinds(ev, 'notice')[0].message, /RunCommand/);
});

test('baris non-JSON (log stderr) menjadi event log', () => {
  const parse = createStreamParser('codex');
  assert.deepEqual(parse('Reading additional input from stdin...'), [
    { kind: 'log', line: 'Reading additional input from stdin...' },
  ]);
  assert.deepEqual(parse('   '), []);
});
