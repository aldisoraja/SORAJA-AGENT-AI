/**
 * Uji end-to-end Chat GUI: baris NDJSON nyata (fixtures) → parser → reducer → pesan akhir.
 * Memastikan jawaban, timeline, aksi ditolak, dan diff yang tampil di UI akurat untuk tiap CLI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStreamParser } from '../src/services/cli/streamParsers.ts';
import { appendAnswerLine, applyAgentEvent, applyFileDiff } from '../src/services/cli/messageReducer.ts';
import { finalizeMessage, markDenied } from '../src/services/cli/trajectoryBuilder.ts';
import { countSteps, messageFlow } from '../src/components/chat/work/workSummary.ts';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}.ndjson`, import.meta.url), 'utf8').split('\n');

/** Menjalankan baris NDJSON seperti jembatan stream; mengembalikan pesan akhir + urutan event. */
function replay(agentId, lines, exitCode = 0) {
  const parse = createStreamParser(agentId);
  let msg = { id: 'm', conversationId: 'c', sender: 'agent', content: '', timestamp: '', agentId, status: 'running', startedAt: 0 };
  const events = [];
  let t = 1000;
  for (const line of lines) {
    for (const ev of parse(line)) {
      events.push(ev);
      msg = applyAgentEvent(msg, ev, (t += 1000));
    }
  }
  return { msg: finalizeMessage(msg, exitCode, t + 1000), events };
}

const json = (o) => JSON.stringify(o);
const byType = (msg, type) => (msg.trajectory || []).filter((s) => s.type === type);

test('Claude (fixture): jawaban utuh, edit + perintah selesai, file_change setelah tool berhasil', () => {
  const { msg, events } = replay('claude', fixture('claude'));
  assert.equal(msg.status, 'done');
  assert.equal(msg.content, 'Saya membuat `hello.txt` berisi teks "halo", lalu menjalankan `echo selesai` dan hasilnya "selesai".');
  const [edit] = byType(msg, 'edited');
  assert.equal(edit.status, 'done');
  assert.equal(edit.file, 'C:\\work\\demo\\hello.txt');
  const [cmd] = byType(msg, 'command');
  assert.equal(cmd.command, 'echo selesai');
  assert.equal(cmd.output, 'selesai');
  const kinds = events.map((e) => (e.kind === 'tool' ? `tool:${e.status}` : e.kind));
  assert.ok(kinds.indexOf('file_change') > kinds.indexOf('tool:done'), 'diff dihitung setelah berkas benar-benar ditulis');
  assert.equal(msg.usage.inputTokens, 35414);
  assert.ok(Math.abs(msg.usage.costUsd - 0.1528998) < 1e-9);
});

test('Claude: blok teks antar-tool dipisah paragraf; teks sub-agen tidak masuk jawaban', () => {
  const lines = [
    json({ type: 'assistant', message: { content: [{ type: 'text', text: 'Saya cek dulu.' }, { type: 'tool_use', id: 't1', name: 'Task', input: { description: 'Telusuri' } }] } }),
    json({ type: 'assistant', parent_tool_use_id: 't1', message: { content: [{ type: 'text', text: 'LAPORAN INTERNAL SUB-AGEN' }, { type: 'tool_use', id: 's1', name: 'Grep', input: { pattern: 'useState' } }] } }),
    json({ type: 'user', parent_tool_use_id: 't1', message: { content: [{ type: 'tool_result', tool_use_id: 's1', content: '3 hasil' }] } }),
    json({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'selesai' }] } }),
    json({ type: 'assistant', message: { content: [{ type: 'text', text: 'Sudah selesai.' }] } }),
    json({ type: 'result', is_error: false, usage: {} }),
  ];
  const { msg } = replay('claude', lines);
  assert.equal(msg.content, 'Saya cek dulu.\n\nSudah selesai.');
  assert.ok(!msg.content.includes('SUB-AGEN'));
  assert.equal(byType(msg, 'explored').length, 1, 'tool sub-agen tetap tercatat di timeline');
  assert.equal(byType(msg, 'tool')[0].detail, 'Telusuri');
});

test('Claude: edit yang gagal/ditolak tidak memicu diff; permission_denials → langkah "ditolak" + notice', () => {
  const lines = [
    json({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: 'D:/p/a.ts', content: 'x' } }] } }),
    json({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'w1', is_error: true, content: 'EACCES: tidak bisa menulis' }] } }),
    json({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'rm -rf dist' } }] } }),
    json({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'b1', is_error: true, content: "Claude requested permissions to use Bash, but you haven't granted it yet." }] } }),
    json({ type: 'assistant', message: { content: [{ type: 'text', text: 'Tidak bisa melanjutkan.' }] } }),
    json({ type: 'result', is_error: false, usage: {}, permission_denials: [{ tool_name: 'Bash', tool_use_id: 'b1', tool_input: {} }] }),
  ];
  const { msg, events } = replay('claude', lines);
  assert.equal(events.filter((e) => e.kind === 'file_change').length, 0);
  const [edit] = byType(msg, 'edited');
  assert.equal(edit.status, 'error', 'gagal menulis = gagal, bukan ditolak');
  const [cmd] = byType(msg, 'command');
  assert.equal(cmd.status, 'denied');
  assert.ok(msg.content.startsWith('Tidak bisa melanjutkan.\n\n> ⚠️ Aksi ditolak di mode aman: Bash.'));
  const c = countSteps(msg.trajectory, msg.codeEdits);
  assert.equal(c.denied, 1);
  assert.equal(c.edits, 0, 'edit gagal tidak dihitung sebagai berkas diubah');
});

test('Claude: TodoWrite menjadi satu langkah rencana yang diperbarui', () => {
  const todo = (id, statuses) =>
    json({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: 'TodoWrite', input: { todos: [
      { content: 'Baca kode', status: statuses[0], activeForm: 'Membaca kode' },
      { content: 'Perbaiki bug', status: statuses[1], activeForm: 'Memperbaiki bug' },
    ] } }] } });
  const { msg } = replay('claude', [
    todo('p1', ['in_progress', 'pending']),
    json({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'p1', content: 'ok' }] } }),
    todo('p2', ['completed', 'in_progress']),
    json({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'p2', content: 'ok' }] } }),
  ]);
  const plans = byType(msg, 'plan');
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0].todos.map((t) => t.status), ['done', 'active']);
  assert.equal(plans[0].status, 'done');
});

test('Codex (fixture): dua paragraf jawaban, perintah shell selesai beserta keluaran', () => {
  const { msg } = replay('codex', fixture('codex'));
  assert.equal(
    msg.content,
    'Saya akan memeriksa apakah workspace mengizinkan pembuatan file; lalu saya jalankan `echo selesai` dan laporkan hasilnya.\n\nFile `hello.txt` berisi `halo` sudah dibuat, lalu saya menjalankan `echo selesai`.'
  );
  const [cmd] = byType(msg, 'command');
  assert.equal(cmd.status, 'done');
  assert.equal(cmd.output, 'selesai\r\n');
  assert.equal(msg.usage.outputTokens, 124);
});

test('Codex: file_change langsung memberi langkah edit (urutan kronologis), todo_list & web_search', () => {
  const { msg } = replay('codex', [
    json({ type: 'item.started', item: { id: 'p', type: 'todo_list', items: [{ text: 'Ubah README', completed: false }] } }),
    json({ type: 'item.completed', item: { id: 'w', type: 'web_search', query: 'tauri v2 event' } }),
    json({ type: 'item.completed', item: { id: 'f', type: 'file_change', changes: [{ path: 'D:/p/README.md', kind: 'update' }] } }),
    json({ type: 'item.completed', item: { id: 'p', type: 'todo_list', items: [{ text: 'Ubah README', completed: true }] } }),
    json({ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: 'Selesai.' } }),
    json({ type: 'turn.completed', usage: {} }),
  ]);
  assert.deepEqual(msg.trajectory.map((s) => s.type), ['plan', 'web', 'edited', 'text'], 'jawaban sesudah langkah tool, kronologis');
  assert.equal(byType(msg, 'text')[0].text, 'Selesai.');
  assert.equal(byType(msg, 'web')[0].label, 'tauri v2 event');
  assert.equal(byType(msg, 'plan')[0].todos[0].status, 'done');
  assert.equal(byType(msg, 'edited')[0].file, 'D:/p/README.md');
});

test('Codex (blocked): hanya jawaban teks, tanpa langkah palsu', () => {
  const { msg } = replay('codex', fixture('codex-blocked'));
  assert.deepEqual(msg.trajectory.map((s) => s.type), ['text'], 'tanpa langkah tool palsu');
  assert.ok(msg.content.includes('Perintah ditolak kebijakan lingkungan'));
  assert.equal(byType(msg, 'text')[0].text, msg.content, 'segmen teks = isi jawaban');
});

test('OpenCode (fixture): tulis diblokir = ditolak, tulis ulang berhasil; berkas unik dihitung sekali', () => {
  const { msg, events } = replay('opencode', fixture('opencode'));
  const edits = byType(msg, 'edited');
  assert.deepEqual(edits.map((s) => s.status), ['denied', 'done']);
  assert.equal(events.filter((e) => e.kind === 'file_change').length, 1);
  assert.equal(countSteps(msg.trajectory).edits, 1);
  assert.equal(byType(msg, 'command')[0].output, 'selesai\n');
  assert.equal(msg.usage.inputTokens, 30290 + 169 + 183, 'token per langkah dijumlahkan');
});

test('OpenCode: tool patch melaporkan semua berkas di patchText', () => {
  const patchText = '*** Begin Patch\n*** Update File: src/a.ts\n@@\n-x\n+y\n*** Add File: src/b.ts\n+z\n*** End Patch';
  const { events } = replay('opencode', [
    json({ type: 'tool_use', sessionID: 's', part: { tool: 'patch', callID: 'c1', state: { status: 'completed', input: { patchText }, output: 'ok' } } }),
  ]);
  assert.deepEqual(events.filter((e) => e.kind === 'file_change').map((e) => e.path), ['src/a.ts', 'src/b.ts']);
});

test('Antigravity (fixture denied): perintah yang ditolak tidak lagi tampil "selesai"', () => {
  const { msg } = replay('antigravity', fixture('antigravity-denied'));
  assert.equal(byType(msg, 'command')[0].status, 'denied');
  assert.equal(byType(msg, 'edited')[0].status, 'done', 'edit berkas di mode aman tetap jalan');
  assert.ok(msg.content.includes('Aksi ditolak di mode aman: RunCommand'));
});

test('Antigravity (fixture): teks streaming tidak digandakan oleh result.response', () => {
  const { msg } = replay('antigravity', fixture('antigravity'));
  assert.equal(msg.content, 'Rust adalah bahasa pemrograman sistem yang dirancang untuk memberikan performa tinggi serta keamanan memori tanpa memerlukan *garbage collector*.\n');
});

test('Kiro (fixture): jawaban, kredit, status sukses', () => {
  const { msg } = replay('kiro', fixture('kiro'));
  assert.equal(msg.content, 'ok');
  assert.ok(Math.abs(msg.usage.credits - 0.0666016232172471) < 1e-12);
  assert.equal(msg.status, 'done');
});

test('Kiro: kategori ACP dipakai (edit/execute), update tanpa kind tetap memicu diff, plan ACP', () => {
  const upd = (update) => json({ type: 'sessionUpdate', data: { sessionId: 'k', update } });
  const { msg, events } = replay('kiro', [
    upd({ sessionUpdate: 'plan', entries: [{ content: 'Edit berkas', status: 'in_progress', priority: 'high' }] }),
    upd({ sessionUpdate: 'tool_call', toolCallId: 'e1', title: 'Menulis a.ts', kind: 'edit', status: 'pending', rawInput: { path: 'D:/p/a.ts' } }),
    upd({ sessionUpdate: 'tool_call_update', toolCallId: 'e1', status: 'completed' }),
    upd({ sessionUpdate: 'tool_call', toolCallId: 'x1', title: 'Menjalankan tes', kind: 'execute', status: 'in_progress', rawInput: { command: 'npm test' } }),
    upd({ sessionUpdate: 'tool_call_update', toolCallId: 'x1', status: 'completed', rawOutput: 'lulus' }),
  ]);
  assert.deepEqual(msg.trajectory.map((s) => s.type), ['plan', 'edited', 'command']);
  assert.equal(byType(msg, 'command')[0].command, 'npm test');
  assert.deepEqual(events.filter((e) => e.kind === 'file_change').map((e) => e.path), ['D:/p/a.ts']);
});

test('Kiro: tool yang ditolak di mode non-interaktif tampil "ditolak", bukan "gagal" (output nyata kiro-cli)', () => {
  const upd = (update) => json({ type: 'sessionUpdate', data: { sessionId: 'k', update } });
  const { msg } = replay('kiro', [
    upd({ sessionUpdate: 'tool_call', toolCallId: 'x1', title: 'Jalankan hitung.js', kind: 'execute', status: 'pending', rawInput: { command: 'node hitung.js' } }),
    upd({ sessionUpdate: 'tool_call_update', toolCallId: 'x1', status: 'failed', content: [{ type: 'content', content: { type: 'text', text: 'Output:\nThe user rejected this tool call.\n\nExit Code: -1' } }] }),
  ]);
  assert.equal(byType(msg, 'command')[0].status, 'denied');
});

test('Kiro & Antigravity: teks yang berlanjut setelah tool menjadi paragraf baru (bug "…fungsi lain.Sepertinya…")', () => {
  const upd = (update) => json({ type: 'sessionUpdate', data: { sessionId: 'k', update } });
  const kiro = replay('kiro', [
    upd({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Saya ubah ' } }),
    upd({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'berkasnya.' } }),
    upd({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Replace in File', kind: 'edit', status: 'pending' }),
    upd({ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' }),
    upd({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Selesai.' } }),
  ]);
  assert.equal(kiro.msg.content, 'Saya ubah berkasnya.\n\nSelesai.');
  const step = (s) => json({ event: 'step_update', step_update: s });
  const agy = replay('antigravity', [
    step({ step_index: 1, step_type: 'agent_response', text_delta: 'Membaca dulu.' }),
    step({ step_index: 2, step_type: 'tool', tool_name: 'view_file', state: 'DONE', tool_info: { parameters: {} } }),
    step({ step_index: 3, step_type: 'agent_response', text_delta: 'Ini ' }),
    step({ step_index: 3, step_type: 'agent_response', text_delta: 'hasilnya.' }),
  ]);
  assert.equal(agy.msg.content, 'Membaca dulu.\n\nIni hasilnya.');
});

test('applyFileDiff: diff nyata ditempel; berkas tanpa perubahan nyata dibersihkan', () => {
  const { msg } = replay('claude', fixture('claude'));
  const chunk = { file: 'C:\\work\\demo\\hello.txt', relativePath: 'hello.txt', additions: 1, deletions: 0, diffLines: [{ type: 'added', newLineNo: 1, text: 'halo' }] };
  const withDiff = applyFileDiff(msg, chunk.file, chunk);
  assert.equal(withDiff.codeEdits.length, 1);
  assert.equal(byType(withDiff, 'edited')[0].additions, 1);
  assert.equal(applyFileDiff(withDiff, chunk.file, { ...chunk, additions: 2 }).codeEdits.length, 1, 'diff berkas sama diganti, bukan ditambah');
  const cleared = applyFileDiff(withDiff, 'c:/work/demo/hello.txt', null);
  assert.equal(cleared.codeEdits, undefined);
  assert.equal(byType(cleared, 'edited')[0].additions, undefined);
});

test('countSteps: edit berulang pada berkas sama tidak menggandakan total +/−', () => {
  const chunk = { file: 'D:/p/a.ts', relativePath: 'a.ts', additions: 5, deletions: 2, diffLines: [] };
  const steps = [
    { type: 'edited', label: 'a.ts', file: 'D:/p/a.ts', status: 'done', additions: 5, deletions: 2 },
    { type: 'edited', label: 'a.ts', file: 'D:\\p\\a.ts', status: 'done', additions: 5, deletions: 2 },
  ];
  assert.deepEqual([countSteps(steps).edits, countSteps(steps).additions], [1, 5]);
  assert.deepEqual([countSteps(steps, [chunk]).edits, countSteps(steps, [chunk]).deletions], [1, 2]);
});

test('markDenied: per jenis aksi menandai langkah terakhir yang belum ditolak', () => {
  const steps = [
    { type: 'command', label: 'a', status: 'done' },
    { type: 'edited', label: 'b', status: 'done' },
    { type: 'command', label: 'c', status: 'done' },
  ];
  let out = markDenied(steps, { kind: 'denied', action: 'command' });
  assert.deepEqual(out.map((s) => s.status), ['done', 'done', 'denied']);
  out = markDenied(out, { kind: 'denied', action: 'command' });
  assert.deepEqual(out.map((s) => s.status), ['denied', 'done', 'denied']);
  assert.equal(markDenied(out, { kind: 'denied', toolId: 'tidak-ada' }), out, 'id tak dikenal tidak menandai langkah acak');
});

test('notice yang sama tidak ditulis dua kali; notice pertama tanpa baris kosong di awal', () => {
  let m = { id: 'm', conversationId: 'c', sender: 'agent', content: '', timestamp: '' };
  const ev = { kind: 'notice', level: 'warn', message: 'Aksi ditolak.' };
  m = applyAgentEvent(applyAgentEvent(m, ev, 1), ev, 2);
  assert.equal(m.content, '> ⚠️ Aksi ditolak.');
});

test('Alur kronologis: penjelasan agen diselipkan di antara langkah tool; jawaban akhir terpisah setelah selesai', () => {
  const evs = [
    { kind: 'text', delta: 'Saya cek dulu berkasnya.' },
    { kind: 'tool', id: 'r1', name: 'Read', input: { file_path: 'src/a.ts' }, status: 'running' },
    { kind: 'tool', id: 'r1', name: 'Read', input: {}, status: 'done' },
    { kind: 'text', delta: '\n\nSudah ketemu' },
    { kind: 'text', delta: ', saya perbaiki.' },
    { kind: 'notice', level: 'warn', message: 'Kuota hampir habis' },
  ];
  let msg = { id: 'm', content: '', agentId: 'claude', status: 'running' };
  evs.forEach((ev, i) => (msg = applyAgentEvent(msg, ev, i)));
  assert.deepEqual(msg.trajectory.map((s) => s.type), ['text', 'analyzed', 'text']);
  assert.equal(msg.trajectory[0].text, 'Saya cek dulu berkasnya.');
  assert.equal(msg.trajectory[2].text, 'Sudah ketemu, saya perbaiki.\n\n> ⚠️ Kuota hampir habis', 'notice menempel ke segmen terakhir');
  assert.ok(msg.content.startsWith('Saya cek dulu berkasnya.\n\nSudah ketemu'), 'content tetap utuh (salin/riwayat)');

  const live = messageFlow(msg);
  assert.equal(live.process.length, 3, 'saat berjalan semua teks tampil di dalam alur');
  assert.equal(live.answer, '');

  const done = messageFlow(finalizeMessage(msg, 0, 99));
  assert.deepEqual(done.process.map((s) => s.type), ['text', 'analyzed']);
  assert.equal(done.answer, msg.trajectory[2].text);
});

test('messageFlow: pesan lama tanpa langkah text → jawaban = content; baris status tanpa teks sebelumnya', () => {
  const legacy = { id: 'm', content: 'Jawaban lama', status: 'done', trajectory: [{ type: 'analyzed', label: 'a.ts', status: 'done' }] };
  assert.deepEqual(messageFlow(legacy), { process: legacy.trajectory, answer: 'Jawaban lama' });

  const stopped = appendAnswerLine({ id: 'm', content: '', status: 'running', trajectory: [{ type: 'command', label: 'npm test', status: 'error' }] }, '> ⏹️ Dihentikan', 5);
  assert.equal(stopped.content, '> ⏹️ Dihentikan');
  assert.deepEqual(stopped.trajectory.map((s) => s.type), ['command', 'text']);
  assert.equal(stopped.trajectory[1].text, '> ⏹️ Dihentikan', 'tanpa baris kosong di awal segmen');
});
