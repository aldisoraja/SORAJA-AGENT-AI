/**
 * Giliran lanjutan otomatis setelah izin ("Izinkan & ulangi" / HITL Antigravity) digabung ke jawaban agen sebelumnya.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatTurns, grantedContinuation } from '../src/components/chat/chatTurns.ts';
import { countSteps } from '../src/components/chat/work/workSummary.ts';

const NOTICE = '> ⚠️ Aksi ditolak di mode aman: RunCommand. Pilih **Izinkan & ulangi** di bawah untuk mengizinkannya, atau buka sesi ini di Terminal.';

const user = (id, content, extra = {}) => ({ id, conversationId: 'c', sender: 'user', content, timestamp: '09:48', ...extra });
const agent = (id, extra = {}) => ({
  id,
  conversationId: 'c',
  sender: 'agent',
  content: '',
  timestamp: '09:48',
  agentId: 'antigravity',
  status: 'done',
  ...extra,
});

const deniedTurn = (id, cmd, startedAt) =>
  agent(id, {
    content: `Saya cek dulu.\n\n${NOTICE}`,
    startedAt,
    finishedAt: startedAt + 14_000,
    deniedCommands: [cmd],
    trajectory: [
      { type: 'command', label: cmd, command: cmd, status: 'denied', toolId: `${id}-t1`, output: 'permission check failed' },
      { type: 'text', label: 'Teks', text: `Saya cek dulu.\n\n${NOTICE}` },
    ],
  });

test('grantedContinuation: flag baru dan prompt riwayat lama dikenali', () => {
  assert.deepEqual(grantedContinuation(user('u', 'apa saja', { grantContinuation: ['Bash'] })), ['Bash']);
  assert.deepEqual(
    grantedContinuation(user('u', 'Perintah `ls -R`, `dir` sudah saya izinkan. Jalankan lagi persis seperti sebelumnya, lalu lanjutkan sampai tugasnya selesai.')),
    ['ls -R', 'dir']
  );
  assert.deepEqual(
    grantedContinuation(user('u', 'Saya mengizinkan aksi yang tadi ditolak (Bash, Write). Ulangi langkah tersebut, lalu lanjutkan sampai tugasnya selesai.')),
    ['Bash', 'Write']
  );
  assert.equal(grantedContinuation(user('u', 'coba cek schema h2h')), null);
});

test('buildChatTurns: dua lanjutan izin menjadi satu giliran agen', () => {
  const messages = [
    user('u1', 'coba cek schema h2h'),
    deniedTurn('a1', 'Get-ChildItem -Recurse', 1_000),
    user('u2', 'x', { grantContinuation: ['Get-ChildItem -Recurse'] }),
    deniedTurn('a2', 'Get-ChildItem -Path src', 20_000),
    user('u3', 'x', { grantContinuation: ['Get-ChildItem -Path src'] }),
    agent('a3', {
      content: 'mapping_id berasal dari sequence.',
      startedAt: 40_000,
      finishedAt: 50_000,
      trajectory: [
        { type: 'command', label: 'ls', command: 'ls', status: 'done', toolId: 'a3-t1' },
        { type: 'text', label: 'Teks', text: 'mapping_id berasal dari sequence.' },
      ],
    }),
  ];
  const turns = buildChatTurns(messages);
  assert.deepEqual(turns.map((t) => t.msg.id), ['u1', 'a1']);
  const merged = turns[1].msg;
  assert.equal(turns[1].index, 1);
  assert.equal(merged.status, 'done');
  assert.deepEqual(
    merged.trajectory.map((s) => s.type),
    ['command', 'text', 'granted', 'command', 'text', 'granted', 'command', 'text']
  );
  assert.ok(merged.trajectory.every((s) => !s.text?.includes('Aksi ditolak di mode aman')), 'notice lama dibuang');
  assert.equal(merged.trajectory[2].command, 'Get-ChildItem -Recurse');
  assert.equal(countSteps(merged.trajectory).denied, 0, 'penolakan yang sudah diizinkan tidak dihitung lagi');
  assert.equal(merged.finishedAt - merged.startedAt, 38_000, 'durasi tanpa jeda menunggu izin');
  assert.equal(merged.deniedCommands, undefined);
  assert.match(merged.content, /mapping_id berasal dari sequence\.$/);
});

test('buildChatTurns: izin terkirim, pesan agen lanjutan belum ada → giliran tetap berjalan', () => {
  const turns = buildChatTurns([
    user('u1', 'tanya'),
    deniedTurn('a1', 'dir', 1_000),
    user('u2', 'x', { grantContinuation: ['dir'] }),
  ]);
  assert.equal(turns.length, 2);
  assert.equal(turns[1].msg.status, 'running');
  assert.equal(turns[1].msg.trajectory.at(-1).type, 'granted');
});

test('buildChatTurns: pesan biasa & agen berbeda tidak digabung', () => {
  const turns = buildChatTurns([
    user('u1', 'tanya'),
    agent('a1', { content: 'jawab' }),
    user('u2', 'pertanyaan lanjutan'),
    agent('a2', { content: 'jawab lagi' }),
  ]);
  assert.deepEqual(turns.map((t) => t.msg.id), ['u1', 'a1', 'u2', 'a2']);
  assert.equal(turns[1].msg, buildChatTurns([turns[1].msg])[0].msg, 'pesan tanpa lanjutan tidak disalin');

  const other = buildChatTurns([
    deniedTurn('a1', 'dir', 1_000),
    user('u2', 'x', { grantContinuation: ['dir'] }),
    agent('a2', { agentId: 'claude', content: 'dari agen lain' }),
  ]);
  assert.deepEqual(other.map((t) => t.msg.id), ['a1', 'a2']);
});
