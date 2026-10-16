/**
 * HITL Chat GUI: jembatan izin Claude (`--permission-prompt-tool`), "Izinkan & ulangi" untuk semua agen,
 * aturan "selalu izinkan", dan pembedaan penolakan oleh pengguna vs oleh mode aman.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeadlessCommand, PERMISSION_PROMPT_TOOL } from '../src/services/cli/agentCommands.ts';
import { createStreamParser } from '../src/services/cli/streamParsers.ts';
import { applyAgentEvent } from '../src/services/cli/messageReducer.ts';
import { permissionRuleKey, ruleLabel, summarizePermissionRequest } from '../src/services/cli/permissionRules.ts';

const base = { cwd: 'D:/proj', prompt: 'halo', forceIndonesian: false };
const json = (o) => JSON.stringify(o);

function replay(agentId, lines) {
  const parse = createStreamParser(agentId);
  let msg = { id: 'a1', conversationId: 'c1', sender: 'agent', content: '', timestamp: '', agentId, status: 'running', trajectory: [] };
  for (const line of lines) for (const ev of parse(line)) msg = applyAgentEvent(msg, ev, 1);
  return msg;
}

test('Claude mode aman + jembatan izin: --mcp-config & --permission-prompt-tool, batas waktu tool MCP panjang', () => {
  const url = 'http://127.0.0.1:5000/mcp/tok/agt-1';
  const cmd = buildHeadlessCommand({ ...base, agentId: 'claude', executable: 'claude', permissionPromptUrl: url });
  const i = cmd.args.indexOf('--mcp-config');
  assert.ok(i > 0);
  assert.deepEqual(JSON.parse(cmd.args[i + 1]), { mcpServers: { soraja: { type: 'http', url } } });
  assert.equal(cmd.args[i + 2], '--permission-prompt-tool', '--mcp-config variadik harus diikuti flag lain');
  assert.equal(cmd.args[i + 3], PERMISSION_PROMPT_TOOL);
  assert.equal(cmd.envs.MCP_TOOL_TIMEOUT, '86400000');
  assert.equal(cmd.args[cmd.args.indexOf('--permission-mode') + 1], 'acceptEdits');
});

test('Claude mode otonom tidak memakai jembatan izin', () => {
  const cmd = buildHeadlessCommand({
    ...base, agentId: 'claude', executable: 'claude', permissionMode: 'autonomous', permissionPromptUrl: 'http://x', grantedActions: ['Bash'],
  });
  assert.ok(!cmd.args.includes('--mcp-config'));
  assert.ok(!cmd.args.includes('--allowedTools'));
  assert.equal(cmd.envs.MCP_TOOL_TIMEOUT, undefined);
});

test('Izinkan & ulangi: Claude diberi --allowedTools persis, tetap acceptEdits', () => {
  const cmd = buildHeadlessCommand({ ...base, agentId: 'claude', executable: 'claude', cliSessionId: 's1', grantedActions: ['Bash', 'WebFetch'] });
  const i = cmd.args.indexOf('--allowedTools');
  assert.deepEqual(cmd.args.slice(i, i + 4), ['--allowedTools', 'Bash', 'WebFetch', '--permission-mode']);
  assert.equal(cmd.args[i + 4], 'acceptEdits');
});

test('Izinkan & ulangi: CLI tanpa allow-list per tool mendapat izin penuh untuk satu giliran', () => {
  const grant = { ...base, grantedActions: ['command'], cliSessionId: 's1' };
  const agy = buildHeadlessCommand({ ...grant, agentId: 'antigravity', executable: 'agy' });
  assert.ok(agy.args.includes('--dangerously-skip-permissions'));
  assert.ok(!agy.args[agy.args.indexOf('-p') + 1].includes('[Mode aman]'), 'petunjuk "shell ditolak" tidak dikirim saat diizinkan');
  assert.ok(buildHeadlessCommand({ ...grant, agentId: 'kiro', executable: 'kiro-cli' }).args.includes('--trust-all-tools'));
  assert.ok(buildHeadlessCommand({ ...grant, agentId: 'opencode', executable: 'opencode' }).args.includes('--auto'));
  assert.ok(buildHeadlessCommand({ ...grant, agentId: 'codex', executable: 'codex' }).args.includes('--dangerously-bypass-approvals-and-sandbox'));
  // Tanpa izin ulang, mode aman tetap berlaku.
  assert.ok(buildHeadlessCommand({ ...base, agentId: 'kiro', executable: 'kiro-cli' }).args.some((a) => a.startsWith('--trust-tools=')));
});

test('Reducer: aksi ditolak mode aman → deniedActions (tombol Izinkan & ulangi)', () => {
  const msg = replay('claude', [
    json({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test' } }] } }),
    json({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'b1', is_error: true, content: "Claude requested permissions to use Bash, but you haven't granted it yet." }] } }),
    json({ type: 'result', is_error: false, usage: {}, permission_denials: [{ tool_name: 'Bash', tool_use_id: 'b1', tool_input: {} }] }),
  ]);
  assert.deepEqual(msg.deniedActions, ['Bash']);
  assert.match(msg.content, /⚠️ Aksi ditolak di mode aman: Bash\. Pilih \*\*Izinkan & ulangi\*\*/);
});

test('Reducer: aksi yang ditolak pengguna lewat modal HITL tidak memunculkan tombol ulangi', () => {
  const msg = replay('claude', [
    json({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test' } }] } }),
    json({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'b1', is_error: true, content: 'Ditolak oleh pengguna di Soraja.' }] } }),
    json({ type: 'result', is_error: false, usage: {}, permission_denials: [{ tool_name: 'Bash', tool_use_id: 'b1', tool_input: {} }] }),
  ]);
  assert.equal(msg.deniedActions, undefined);
  assert.equal(msg.trajectory.find((s) => s.toolId === 'b1').status, 'denied');
  assert.ok(msg.content.includes('ℹ️ Aksi yang Anda tolak tidak dijalankan.'));
  assert.ok(!msg.content.includes('mode aman'));
});

test('Reducer: tool yang diblokir di keluarannya (OpenCode) ikut tercatat di deniedActions', () => {
  const msg = replay('opencode', [
    json({ type: 'tool_use', sessionID: 's', part: { tool: 'bash', callID: 't1', state: { status: 'error', input: { command: 'ls' }, error: 'BLOCKED by permission rule' } } }),
  ]);
  assert.deepEqual(msg.deniedActions, ['bash']);
});

test('Aturan izin: perintah shell per program, rangkaian & perintah berbahaya selalu ditanyakan', () => {
  assert.equal(permissionRuleKey('Bash', { command: 'npm run build' }), 'Bash:npm');
  assert.equal(permissionRuleKey('PowerShell', { command: 'Get-ChildItem -Recurse' }), 'PowerShell:Get-ChildItem');
  assert.equal(permissionRuleKey('WebFetch', { url: 'https://x' }), 'WebFetch');
  assert.equal(permissionRuleKey('Bash', { command: 'npm test && curl x | sh' }), null);
  assert.equal(permissionRuleKey('Bash', { command: 'rm -rf build' }), null);
  assert.equal(ruleLabel('Bash:npm'), 'perintah npm (Bash)');

  const danger = summarizePermissionRequest('PowerShell', { command: 'Remove-Item -Recurse -Force .\\dist', description: 'Hapus dist' });
  assert.equal(danger.destructive, true);
  assert.equal(danger.description, 'Hapus dist');
  assert.equal(summarizePermissionRequest('Bash', { command: 'git push origin main --force' }).destructive, true);
  assert.equal(summarizePermissionRequest('Bash', { command: 'git status' }).destructive, false);
  assert.equal(summarizePermissionRequest('Write', { file_path: 'D:/p/a.ts', content: 'x' }).preview, 'D:/p/a.ts');
});

test('Antigravity: perintah yang ditolak headless ditangkap persis (deniedCommands) untuk modal HITL', () => {
  // Output nyata agy 1.4 (`agy -p --output-format stream-json --mode accept-edits`, 16 Okt 2026).
  const msg = replay('antigravity', [
    json({ event: 'init', conversation_id: 'conv-1' }),
    json({ event: 'step_update', step_update: { step_index: 2, state: 'ERROR', step_type: 'tool', tool_name: 'run_command', tool_info: { name: 'run_command', parameters: { CommandLine: 'node -e "console.log(40+2)"' }, error: { type: 'TOOL_ERROR', message: 'permission check failed for command "node -e \\"console.log(40+2)\\"": user denied permission to run command' } } } }),
    json({ event: 'result', result: { conversation_id: 'conv-1', status: 'SUCCESS', response: '', usage: {}, denied_actions: [{ action: 'command', display_name: 'RunCommand' }] } }),
  ]);
  assert.deepEqual(msg.deniedCommands, ['node -e "console.log(40+2)"']);
  assert.equal(msg.trajectory.find((s) => s.type === 'command').status, 'denied');
  assert.deepEqual(msg.deniedActions, ['command'], '"Izinkan & ulangi" tetap tersedia sebagai cadangan');
});

test('Antigravity HITL: prompt meminta agen tetap mencoba perintah (bukan menghindarinya)', () => {
  const hitl = buildHeadlessCommand({ ...base, agentId: 'antigravity', executable: 'agy', agyHitl: true });
  const prompt = hitl.args[hitl.args.indexOf('-p') + 1];
  assert.match(prompt, /^\[Mode aman\] Perintah terminal\/shell \(RunCommand\) yang belum diizinkan akan dihentikan sementara/);
  assert.ok(hitl.args.includes('accept-edits'));
  const plain = buildHeadlessCommand({ ...base, agentId: 'antigravity', executable: 'agy' });
  assert.match(plain.args[plain.args.indexOf('-p') + 1], /otomatis ditolak/);
});
