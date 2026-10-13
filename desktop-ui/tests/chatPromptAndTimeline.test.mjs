import test from 'node:test';
import assert from 'node:assert/strict';
import { attachmentFileName, buildChatPrompt } from '../src/services/cli/chatPrompt.ts';
import {
  addUsage,
  appendThinking,
  applyToolEvent,
  attachDiffToSteps,
  finalizeMessage,
  toolStep,
} from '../src/services/cli/trajectoryBuilder.ts';

test('buildChatPrompt: teks pengguna utuh (multi-baris & karakter khusus) tanpa lampiran', () => {
  const text = 'Baris 1 "kutip" & 50% <tag>\nBaris 2 | pipa';
  assert.equal(buildChatPrompt(`  ${text}  `), text);
});

test('buildChatPrompt: lampiran bernomor dengan path & instruksi baca', () => {
  const out = buildChatPrompt('cek UI ini', [
    { path: 'D:/p/.soraja/attachments/u1/01-a.png', name: 'a.png', kind: 'image' },
    { path: 'D:/p/.soraja/attachments/u1/02-b.png', name: 'b.png', kind: 'image' },
    { path: 'D:/p/.soraja/attachments/u1/03-c.docx', name: 'c.docx', kind: 'document' },
  ], true);
  assert.ok(out.startsWith('cek UI ini\n'));
  assert.ok(out.includes('(2 gambar, 1 dokumen)'));
  assert.ok(out.includes('- Gambar #1 "a.png": D:/p/.soraja/attachments/u1/01-a.png'));
  assert.ok(out.includes('- Gambar #2 "b.png"'));
  assert.ok(out.includes('- Dokumen #1 "c.docx"'));
  assert.ok(out.includes('dilampirkan langsung'));
  assert.ok(out.includes('Word/Excel'));
  assert.ok(buildChatPrompt('', [{ path: 'x.png', name: 'x.png', kind: 'image' }]).startsWith('(Pengguna hanya mengirim lampiran'));
});

test('attachmentFileName: urut, aman, berekstensi', () => {
  assert.equal(attachmentFileName(0, 'Screenshot 2026.png'), '01-Screenshot_2026.png');
  assert.equal(attachmentFileName(9, '../../evil', 'png'), '10-_.._evil.png');
  assert.equal(attachmentFileName(2, '', 'jpg'), '03-lampiran.jpg');
});

test('timeline: penalaran streaming digabung, tool menutup blok penalaran', () => {
  let steps = appendThinking([], 'Mem', true, 1);
  steps = appendThinking(steps, 'baca', true, 2);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].thoughtContent, 'Membaca');
  steps = applyToolEvent(steps, { kind: 'tool', id: 't1', name: 'Read', input: { file_path: 'D:/p/src/App.tsx' }, status: 'running' }, 3000);
  assert.equal(steps[0].status, 'done');
  assert.equal(steps[1].type, 'analyzed');
  assert.equal(steps[1].file, 'App.tsx');
  steps = applyToolEvent(steps, { kind: 'tool', id: 't1', name: 'Read', input: {}, status: 'done', output: 'isi' }, 4000);
  assert.equal(steps.length, 2, 'event done memperbarui langkah yang sama');
  assert.equal(steps[1].status, 'done');
  assert.equal(steps[1].output, 'isi');
  // Blok penalaran baru setelah tool (CLI per blok → dipisah paragraf bila digabung).
  steps = appendThinking(steps, 'Langkah 2', false, 5000);
  assert.equal(steps.length, 3);
});

test('timeline: jenis tool lintas CLI', () => {
  assert.equal(toolStep({ kind: 'tool', id: 'a', name: 'Bash', input: { command: 'npm test' }, status: 'running' }, 0).command, 'npm test');
  assert.equal(toolStep({ kind: 'tool', id: 'b', name: 'grep_search', input: { Query: 'useState' }, status: 'running' }, 0).type, 'explored');
  const edit = toolStep({ kind: 'tool', id: 'c', name: 'replace_file_content', input: { TargetFile: 'D:/p/a.ts' }, status: 'running' }, 0);
  assert.equal(edit.type, 'edited');
  assert.equal(edit.file, 'D:/p/a.ts');
  assert.equal(toolStep({ kind: 'tool', id: 'd', name: 'WebFetch', input: { url: 'https://x.dev' }, status: 'running' }, 0).type, 'tool');
});

test('timeline: diff menempel ke langkah edit yang sama; Codex menambah langkah baru', () => {
  const chunk = { file: 'D:/p/a.ts', relativePath: 'a.ts', additions: 3, deletions: 1, diffLines: [] };
  const steps = attachDiffToSteps([{ type: 'edited', label: 'a.ts', file: 'D:/p/a.ts', status: 'done' }], chunk);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].additions, 3);
  assert.equal(attachDiffToSteps([], chunk).length, 1);
});

test('finalizeMessage: status akhir, langkah running ditutup, status "stopped" dipertahankan', () => {
  const base = { id: 'm', conversationId: 'c', sender: 'agent', content: 'x', timestamp: '', status: 'running', trajectory: [{ type: 'command', label: 'x', status: 'running' }] };
  const ok = finalizeMessage(base, 0, 10);
  assert.equal(ok.status, 'done');
  assert.equal(ok.trajectory[0].status, 'done');
  assert.equal(finalizeMessage(base, 1, 10).status, 'error');
  assert.equal(finalizeMessage({ ...base, status: 'stopped' }, 1, 10).status, 'stopped');
});

test('addUsage menjumlahkan token per langkah (OpenCode)', () => {
  const u = addUsage(addUsage(undefined, { kind: 'usage', inputTokens: 10, outputTokens: 5, costUsd: 0.01 }), { kind: 'usage', inputTokens: 1, outputTokens: 2 });
  assert.deepEqual(u, { inputTokens: 11, outputTokens: 7, costUsd: 0.01 });
});
