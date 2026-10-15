import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreamParser } from '../src/services/cli/streamParsers.ts';
import { buildHeadlessCommand, buildInteractiveCommand, normalizeAgentId } from '../src/services/cli/agentCommands.ts';

const feed = (agentId, lines) => {
  const parse = createStreamParser(agentId);
  return lines.flatMap((l) => parse(typeof l === 'string' ? l : JSON.stringify(l)));
};

test('normalizeAgentId: kiro-cli → kiro', () => {
  assert.equal(normalizeAgentId('kiro-cli'), 'kiro');
  assert.equal(normalizeAgentId('kiro'), 'kiro');
  assert.equal(normalizeAgentId('lain'), null);
});

test('Kiro headless: subcommand chat, stream-json v3, resume, trust hanya di mode otonom', () => {
  const safe = buildHeadlessCommand({ agentId: 'kiro', executable: 'kiro-cli', cwd: 'C:/p', prompt: 'halo', modelId: 'm1' });
  assert.deepEqual(safe.args.slice(0, 6), ['chat', '--no-interactive', '--output-format', 'stream-json', '--agent-engine', 'v3']);
  assert.ok(!safe.args.includes('--trust-all-tools'));
  assert.ok(safe.args.includes('--model') && safe.args.includes('m1'));
  assert.ok(safe.args.at(-1).endsWith('halo'), 'prompt posisi terakhir');
  assert.ok(safe.args.at(-1).includes('Bahasa Indonesia'), 'aturan bahasa disisipkan di prompt');

  const auto = buildHeadlessCommand({
    agentId: 'kiro', executable: 'kiro-cli', cwd: 'C:/p', prompt: 'x', permissionMode: 'autonomous', cliSessionId: 's-1', apiKey: 'k',
  });
  assert.ok(auto.args.includes('--trust-all-tools'));
  assert.deepEqual(auto.args.slice(auto.args.indexOf('--resume-id'), auto.args.indexOf('--resume-id') + 2), ['--resume-id', 's-1']);
  assert.equal(auto.envs.KIRO_API_KEY, 'k');
});

test('Mode Terminal: kiro-cli chat + resume', () => {
  assert.deepEqual(buildInteractiveCommand({ agentId: 'kiro', executable: 'kiro-cli', cwd: '' }).args, ['chat']);
  assert.deepEqual(
    buildInteractiveCommand({ agentId: 'kiro', executable: 'kiro-cli', cwd: '', cliSessionId: 'id9' }).args,
    ['chat', '--resume-id', 'id9']
  );
});

test('Parser Kiro: sesi, teks, penalaran, tool + perubahan berkas, selesai', () => {
  const ev = feed('kiro', [
    { type: 'runStarted', data: { payloadSchema: 'acp', engine: 'v3', sessionId: 'k-1' } },
    { type: 'sessionUpdate', data: { update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'pikir' } } } },
    { type: 'sessionUpdate', data: { update: { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Edit a.ts', kind: 'edit', status: 'pending', rawInput: { path: 'C:/p/a.ts' } } } },
    { type: 'sessionUpdate', data: { update: { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'ok' } }], kind: 'edit' } } },
    { type: 'sessionUpdate', data: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Halo' } } } },
    { type: 'runFinished', data: { status: 'success', finalText: 'Halo' } },
  ]);
  assert.deepEqual(ev[0], { kind: 'session', cliSessionId: 'k-1', model: undefined });
  assert.deepEqual(ev[1], { kind: 'thinking', delta: 'pikir' });
  assert.equal(ev[2].status, 'running');
  assert.deepEqual([ev[3].kind, ev[3].name, ev[3].status, ev[3].output], ['tool', 'Edit a.ts', 'done', 'ok']);
  assert.deepEqual(ev[4], { kind: 'file_change', path: 'C:/p/a.ts' });
  assert.deepEqual(ev[5], { kind: 'text', delta: 'Halo' });
  assert.deepEqual(ev[6], { kind: 'done', ok: true, summary: undefined });
});

test('Parser Kiro: runError & finalText cadangan bila tanpa chunk', () => {
  assert.deepEqual(feed('kiro', [{ type: 'runError', data: { sessionId: 's', stage: 'prompt', message: 'gagal' } }]).at(-1), {
    kind: 'done', ok: false, summary: 'gagal',
  });
  const ev = feed('kiro-cli', [{ type: 'runFinished', data: { status: 'success', finalText: 'Jawaban' } }]);
  assert.deepEqual(ev[0], { kind: 'text', delta: 'Jawaban' });
});

test('Parser Kiro: rekaman NYATA kiro-cli 2.31 (fixtures/kiro.ndjson)', async () => {
  const { readFileSync } = await import('node:fs');
  const lines = readFileSync(new URL('./fixtures/kiro.ndjson', import.meta.url), 'utf8').split('\n');
  const ev = feed('kiro', lines);
  const session = ev.filter((e) => e.kind === 'session');
  assert.equal(session.length, 1, 'sesi dikirim sekali');
  assert.match(session[0].cliSessionId, /^sess_[0-9a-f-]{36}$/);
  assert.equal(ev.filter((e) => e.kind === 'text').map((e) => e.delta).join(''), 'ok');
  assert.deepEqual(ev.at(-1), { kind: 'done', ok: true, summary: undefined });
  assert.ok(!ev.some((e) => e.kind === 'log'), 'tidak ada baris yang gagal diurai');
});

test('Kiro: kredit per giliran dari rekaman nyata dijumlahkan ke usage (bukan token/USD)', async () => {
  const { readFileSync } = await import('node:fs');
  const { addUsage } = await import('../src/services/cli/trajectoryBuilder.ts');
  const lines = readFileSync(new URL('./fixtures/kiro.ndjson', import.meta.url), 'utf8').split('\n');
  const usage = feed('kiro', lines).filter((e) => e.kind === 'usage');
  assert.equal(usage.length, 1, 'kredit dikirim sekali per giliran');
  assert.ok(Math.abs(usage[0].credits - 0.0666016232172471) < 1e-12);
  assert.equal(usage[0].inputTokens + usage[0].outputTokens, 0);
  // Beberapa giliran dalam satu pesan dijumlahkan; tanpa kredit tidak ada field credits
  const two = addUsage(addUsage(undefined, usage[0]), { kind: 'usage', inputTokens: 0, outputTokens: 0, credits: 0.5 });
  assert.ok(Math.abs(two.credits - 0.5666016232172471) < 1e-12);
  assert.equal(addUsage(undefined, { kind: 'usage', inputTokens: 1, outputTokens: 2 }).credits, undefined);
});
