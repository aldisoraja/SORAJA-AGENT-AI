/**
 * HITL Codex app-server & OpenCode ACP: driver JSON-RPC diuji dengan pesan yang direkam dari CLI asli
 * (codex-cli 0.163, opencode 1.19 — 16 Okt 2026) dan IO palsu.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRpcCommand, LANGUAGE_RULE } from '../src/services/cli/agentCommands.ts';
import { codexDisplayCommand, createCodexAppServerDriver } from '../src/services/cli/codexAppServer.ts';
import { createOpencodeAcpDriver } from '../src/services/cli/opencodeAcp.ts';
import { applyAgentEvent } from '../src/services/cli/messageReducer.ts';

const flush = () => new Promise((r) => setImmediate(r));
const line = (o) => JSON.stringify(o);

function fakeIo(decisions = []) {
  const io = {
    sent: [],
    events: [],
    asks: [],
    closed: false,
    write: (l) => io.sent.push(JSON.parse(l)),
    close: () => (io.closed = true),
    emit: (evs) => io.events.push(...evs),
    ask: async (req) => {
      io.asks.push(req);
      return decisions.shift() ?? false;
    },
  };
  return io;
}

/** Menjawab permintaan klien terakhir dengan `result`. */
function answerLast(io, driver, result) {
  const req = io.sent.filter((m) => m.method && m.id !== undefined).at(-1);
  return driver.parse(line({ jsonrpc: '2.0', id: req.id, result }));
}

function toMessage(agentId, events) {
  let msg = { id: 'a1', conversationId: 'c1', sender: 'agent', content: '', timestamp: '', agentId, status: 'running', trajectory: [] };
  for (const ev of events) msg = applyAgentEvent(msg, ev, 1);
  return msg;
}

test('buildRpcCommand: Codex app-server membawa aturan sebagai developerInstructions', () => {
  const cmd = buildRpcCommand({ agentId: 'codex', executable: 'codex', cwd: 'D:/p', prompt: 'halo', modelId: 'gpt-5.5' });
  assert.deepEqual(cmd.args, ['app-server']);
  assert.equal(cmd.prompt, 'halo');
  assert.equal(cmd.instructions, LANGUAGE_RULE);
  assert.equal(cmd.modelId, 'gpt-5.5');
});

test('buildRpcCommand: OpenCode ACP menanyakan bash & tetap memakai berkas aturan bahasa', () => {
  const cmd = buildRpcCommand({ agentId: 'opencode', executable: 'opencode', cwd: 'D:/p', prompt: 'halo', languageRulesPath: 'C:/r.md', modelId: 'cli-default' });
  assert.deepEqual(cmd.args, ['acp']);
  assert.deepEqual(JSON.parse(cmd.envs.OPENCODE_CONFIG_CONTENT), { instructions: ['C:/r.md'], permission: { bash: 'ask' } });
  assert.equal(cmd.modelId, undefined, 'cli-default = model bawaan');
  assert.equal(cmd.prompt, 'halo');
  assert.throws(() => buildRpcCommand({ agentId: 'claude', executable: 'claude', cwd: 'D:/p' }));
});

test('codexDisplayCommand: pembungkus powershell.exe -Command dibuang', () => {
  const wrapped = `"C:\\\\WINDOWS\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command 'node -e "console.log(1)"'`;
  assert.equal(codexDisplayCommand(wrapped, [{ type: 'unknown', command: 'node -e "console.log(1)"' }]), 'node -e "console.log(1)"');
  assert.equal(codexDisplayCommand(`x -Command 'echo ''a'' | sort'`, []), "echo 'a' | sort");
});

test('Codex: handshake, baca otomatis, perintah ditanyakan, edit otomatis, selesai menutup stdin', async () => {
  const io = fakeIo([false]);
  const d = createCodexAppServerDriver({ cwd: 'D:/p', prompt: 'tes', effort: 'max', developerInstructions: 'ATURAN', threadId: 't-lama' }, io);
  const started = d.start();
  await flush();
  assert.equal(io.sent[0].method, 'initialize');
  answerLast(io, d, { userAgent: 'x' });
  await flush();
  assert.equal(io.sent[1].method, 'initialized');
  const resume = io.sent[2];
  assert.equal(resume.method, 'thread/resume');
  assert.equal(resume.params.threadId, 't-lama');
  assert.equal(resume.params.approvalPolicy, 'untrusted');
  assert.equal(resume.params.developerInstructions, 'ATURAN');
  answerLast(io, d, { thread: { id: 't-lama' } });
  await flush();
  assert.deepEqual(io.events[0], { kind: 'session', cliSessionId: 't-lama' });
  const turn = io.sent.at(-1);
  assert.equal(turn.method, 'turn/start');
  assert.equal(turn.params.effort, 'xhigh');
  answerLast(io, d, { turn: { id: 'u1' } });
  await started;

  const events = [];
  // Baca berkas: diizinkan otomatis tanpa modal.
  d.parse(line({ id: 0, method: 'item/commandExecution/requestApproval', params: { itemId: 'e1', commandActions: [{ type: 'read', command: 'Get-Content a.txt' }] } }));
  // Edit berkas: diizinkan otomatis.
  d.parse(line({ id: 1, method: 'item/fileChange/requestApproval', params: { itemId: 'f1' } }));
  // Perintah biasa: ditanyakan (dijawab tolak).
  d.parse(line({ id: 2, method: 'item/commandExecution/requestApproval', params: { itemId: 'e2', command: 'x', commandActions: [{ type: 'unknown', command: 'npm test' }], reason: 'jalankan tes' } }));
  await flush();
  const replies = io.sent.filter((m) => m.result?.decision);
  assert.deepEqual(replies.map((m) => [m.id, m.result.decision]), [[0, 'accept'], [1, 'accept'], [2, 'decline']]);
  assert.deepEqual(io.asks, [{ requestId: 'codex-e2', toolName: 'shell', input: { command: 'npm test', description: 'jalankan tes' } }]);

  events.push(...d.parse(line({ method: 'item/started', params: { item: { type: 'commandExecution', id: 'e2', command: 'x', commandActions: [{ type: 'unknown', command: 'npm test' }], status: 'inProgress' } } })));
  events.push(...d.parse(line({ method: 'item/completed', params: { item: { type: 'commandExecution', id: 'e2', command: 'x', commandActions: [{ type: 'unknown', command: 'npm test' }], status: 'declined' } } })));
  events.push(...d.parse(line({ method: 'item/completed', params: { item: { type: 'fileChange', id: 'f1', status: 'completed', changes: [{ path: 'D:/p/a.ts' }] } } })));
  events.push(...d.parse(line({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { last: { inputTokens: 10, outputTokens: 2 } } } })));
  events.push(...d.parse(line({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { last: { inputTokens: 5, outputTokens: 1 } } } })));
  events.push(...d.parse(line({ method: 'item/completed', params: { item: { type: 'agentMessage', id: 'm1', text: 'Selesai.' } } })));
  events.push(...d.parse(line({ method: 'turn/completed', params: { turn: { status: 'completed', error: null } } })));
  assert.equal(io.closed, true);

  const msg = toMessage('codex', events);
  const cmd = msg.trajectory.find((s) => s.type === 'command');
  assert.equal(cmd.status, 'denied');
  assert.equal(cmd.output, 'Ditolak oleh pengguna di Soraja.');
  assert.equal(msg.deniedActions, undefined, 'ditolak pengguna → tanpa tombol ulangi');
  assert.ok(msg.trajectory.some((s) => s.type === 'edited' && s.file === 'D:/p/a.ts'));
  assert.deepEqual([msg.usage.inputTokens, msg.usage.outputTokens], [15, 3]);
  assert.equal(msg.content, 'Selesai.');
  assert.notEqual(msg.status, 'error');
});

test('Codex: handshake gagal → done gagal + stdin ditutup', async () => {
  const io = fakeIo();
  const d = createCodexAppServerDriver({ cwd: 'D:/p', prompt: 'tes' }, io);
  const started = d.start();
  await flush();
  d.parse(line({ jsonrpc: '2.0', id: io.sent[0].id, error: { code: -1, message: 'belum login' } }));
  await started;
  assert.deepEqual(io.events.at(-1), { kind: 'done', ok: false, summary: 'Codex app-server: belum login' });
  assert.equal(io.closed, true);
});

test('OpenCode ACP: riwayat session/load diabaikan, izin dijawab per opsi, penalaran digabung', async () => {
  const io = fakeIo([true, false]);
  const d = createOpencodeAcpDriver({ cwd: 'D:/p', prompt: 'tes', modelId: 'opencode/big-pickle', sessionId: 'ses_1', filePaths: ['D:\\p\\gambar.png'] }, io);
  const started = d.start();
  await flush();
  assert.equal(io.sent[0].method, 'initialize');
  answerLast(io, d, { protocolVersion: 1 });
  await flush();
  assert.equal(io.sent[1].method, 'session/load');
  // Riwayat yang diputar ulang sebelum session/load selesai tidak boleh masuk ke jawaban baru.
  assert.deepEqual(d.parse(line({ method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { text: 'LAMA' } } } })), []);
  answerLast(io, d, {});
  await flush();
  assert.deepEqual(io.events[0], { kind: 'session', cliSessionId: 'ses_1' });
  assert.equal(io.sent[2].method, 'session/set_model');
  answerLast(io, d, {});
  await flush();
  const prompt = io.sent[3];
  assert.equal(prompt.method, 'session/prompt');
  assert.deepEqual(prompt.params.prompt[1], { type: 'resource_link', uri: 'file:///D:/p/gambar.png', name: 'gambar.png' });

  const events = [];
  const upd = (update) => events.push(...d.parse(line({ method: 'session/update', params: { sessionId: 'ses_1', update } })));
  upd({ sessionUpdate: 'agent_thought_chunk', content: { text: 'Pikir' } });
  upd({ sessionUpdate: 'agent_thought_chunk', content: { text: 'an.' } });
  upd({ sessionUpdate: 'tool_call', toolCallId: 'b1', title: 'bash', kind: 'execute', status: 'pending', rawInput: {} });
  const options = [
    { optionId: 'once', kind: 'allow_once', name: 'Allow once' },
    { optionId: 'always', kind: 'allow_always', name: 'Always allow' },
    { optionId: 'reject', kind: 'reject_once', name: 'Reject' },
  ];
  d.parse(line({ jsonrpc: '2.0', id: 0, method: 'session/request_permission', params: { toolCall: { toolCallId: 'b1', kind: 'execute', rawInput: { command: 'ls' } }, options } }));
  d.parse(line({ jsonrpc: '2.0', id: 1, method: 'session/request_permission', params: { toolCall: { toolCallId: 'b2', kind: 'execute', rawInput: { command: 'rm x' } }, options } }));
  await flush();
  assert.deepEqual(io.sent.filter((m) => m.result?.outcome).map((m) => m.result.outcome.optionId), ['once', 'reject']);
  assert.deepEqual(io.asks.map((a) => [a.requestId, a.toolName, a.input.command]), [['acp-b1', 'bash', 'ls'], ['acp-b2', 'bash', 'rm x']]);
  upd({ sessionUpdate: 'tool_call_update', toolCallId: 'b1', status: 'completed', kind: 'execute', title: 'ls', rawInput: { command: 'ls' }, content: [{ type: 'content', content: { type: 'text', text: 'a.txt' } }] });
  upd({ sessionUpdate: 'tool_call', toolCallId: 'b2', title: 'rm x', kind: 'execute', status: 'pending', rawInput: { command: 'rm x' } });
  upd({ sessionUpdate: 'tool_call_update', toolCallId: 'b2', status: 'failed', content: [{ type: 'content', content: { type: 'text', text: 'The user rejected permission' } }] });
  upd({ sessionUpdate: 'agent_message_chunk', content: { text: 'Beres' } });
  answerLast(io, d, { stopReason: 'end_turn', usage: { inputTokens: 7, outputTokens: 3 } });
  await started;
  assert.equal(io.closed, true);

  const msg = toMessage('opencode', [...events, ...io.events.slice(1)]);
  assert.equal(msg.content, 'Beres');
  assert.equal(msg.trajectory.filter((s) => s.type === 'thought').length, 1, 'potongan penalaran = satu blok');
  assert.equal(msg.reasoning, 'Pikiran.');
  const [ok, rejected] = msg.trajectory.filter((s) => s.type === 'command');
  assert.equal(ok.status, 'done');
  assert.equal(rejected.status, 'denied');
  assert.equal(rejected.output, 'Ditolak oleh pengguna di Soraja.');
  assert.equal(msg.deniedActions, undefined);
  assert.deepEqual([msg.usage.inputTokens, msg.usage.outputTokens], [7, 3]);
});
