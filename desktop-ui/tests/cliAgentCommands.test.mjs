import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeadlessCommand,
  buildInteractiveCommand,
  LANGUAGE_RULE,
} from '../src/services/cli/agentCommands.ts';
import { CHAT_REASONING_RULE } from '../src/services/cli/chatPrompt.ts';

const base = { cwd: 'D:/proj', prompt: 'halo' };

test('claude headless: stream-json, mode aman, aturan bahasa, resume', () => {
  const cmd = buildHeadlessCommand({ ...base, agentId: 'claude', executable: 'claude', cliSessionId: 's1' });
  assert.deepEqual(cmd.args, [
    '-p', 'halo', '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits', '--resume', 's1',
    '--append-system-prompt', LANGUAGE_RULE,
  ]);
  assert.deepEqual(cmd.envs, {});
});

test('codex headless baru vs resume', () => {
  const fresh = buildHeadlessCommand({ ...base, agentId: 'codex', executable: 'codex' });
  assert.deepEqual(fresh.args.slice(0, 6), ['exec', '--json', '--skip-git-repo-check', '--approve-for-me', '-C', 'D:/proj']);
  assert.ok(!fresh.args.some((a) => a.includes('reasoning_effort')), 'effort tidak lagi dikirim dari GUI');
  assert.equal(fresh.args.at(-1), 'halo');

  const resumed = buildHeadlessCommand({ ...base, agentId: 'codex', executable: 'codex', cliSessionId: 't1' });
  assert.deepEqual(resumed.args.slice(0, 4), ['exec', 'resume', '--json', '--skip-git-repo-check']);
  assert.ok(!resumed.args.includes('-C'), 'codex exec resume tidak menerima -C');
  assert.deepEqual(resumed.args.slice(-2), ['t1', 'halo']);
});

test('opencode headless: aturan bahasa via OPENCODE_CONFIG_CONTENT, tanpa --auto di mode aman', () => {
  const cmd = buildHeadlessCommand({
    ...base, agentId: 'opencode', executable: 'opencode', languageRulesPath: 'C:/rules/id.md',
  });
  assert.ok(!cmd.args.includes('--auto'));
  assert.equal(cmd.args.at(-1), 'halo');
  assert.deepEqual(JSON.parse(cmd.envs.OPENCODE_CONFIG_CONTENT), { instructions: ['C:/rules/id.md'] });
});

test('antigravity headless: prefiks bahasa di prompt, mode otonom memakai skip-permissions', () => {
  const cmd = buildHeadlessCommand({
    ...base, agentId: 'antigravity', executable: 'agy', permissionMode: 'autonomous', modelId: 'cli-default',
  });
  assert.ok(cmd.args[1].startsWith('[Instruksi: '));
  assert.ok(cmd.args[1].endsWith('\n\nhalo'));
  assert.ok(cmd.args.includes('--dangerously-skip-permissions'));
  assert.ok(!cmd.args.includes('--model'), 'cli-default tidak boleh dikirim sebagai --model');
});

test('forceIndonesian=false mematikan semua injeksi bahasa', () => {
  const claude = buildHeadlessCommand({ ...base, agentId: 'claude', executable: 'claude', forceIndonesian: false });
  assert.ok(!claude.args.includes('--append-system-prompt'));
  // Mode otonom: tanpa prefiks mode aman, sehingga hanya injeksi bahasa yang diuji di sini.
  const agy = buildHeadlessCommand({ ...base, agentId: 'antigravity', executable: 'agy', forceIndonesian: false, permissionMode: 'autonomous' });
  assert.equal(agy.args[1], 'halo');
  const agySafe = buildHeadlessCommand({ ...base, agentId: 'antigravity', executable: 'agy', forceIndonesian: false });
  assert.doesNotMatch(agySafe.args[1], /Bahasa Indonesia/);
});

test('mode terminal interaktif: tanpa prompt, resume per agen, API key hanya di env', () => {
  assert.deepEqual(
    buildInteractiveCommand({ agentId: 'codex', executable: 'codex', cwd: 'D:/p', cliSessionId: 't1', forceIndonesian: false }).args,
    ['resume', 't1'],
  );
  assert.deepEqual(
    buildInteractiveCommand({ agentId: 'opencode', executable: 'opencode', cwd: 'D:/p', cliSessionId: 'ses_1' }).args,
    ['-s', 'ses_1'],
  );
  const claude = buildInteractiveCommand({ agentId: 'claude', executable: 'claude', cwd: 'D:/p', apiKey: 'sk-x' });
  assert.deepEqual(claude.args, ['--append-system-prompt', LANGUAGE_RULE]);
  assert.deepEqual(claude.envs, { ANTHROPIC_API_KEY: 'sk-x' });
});

test('claude: hanya slug model valid yang dikirim ke --model', () => {
  const build = (modelId) => buildHeadlessCommand({ ...base, agentId: 'claude', executable: 'claude', modelId }).args;
  const modelOf = (args) => args[args.indexOf('--model') + 1];
  assert.equal(modelOf(build('claude-sonnet-5-5')), 'claude-sonnet-5-5');
  assert.equal(modelOf(build('opus')), 'opus');
  for (const bad of ['claude-3-5-sonnet-latest', 'claude-3-7-sonnet-20250219', 'cli-default', undefined]) {
    assert.ok(!build(bad).includes('--model'), `${bad} tidak boleh dikirim`);
  }
});

test('chat GUI: effort per agen (claude/agy --effort, codex reasoning_effort, opencode --variant)', () => {
  const run = (agentId, executable, effort) =>
    buildHeadlessCommand({ ...base, agentId, executable, effort }).args;
  const claude = run('claude', 'claude', 'xhigh');
  assert.equal(claude[claude.indexOf('--effort') + 1], 'xhigh');
  const agy = run('antigravity', 'agy', 'max');
  assert.equal(agy[agy.indexOf('--effort') + 1], 'max');
  assert.ok(run('codex', 'codex', 'max').includes('model_reasoning_effort="xhigh"'), 'codex: max → xhigh');
  const oc = run('opencode', 'opencode', 'high');
  assert.equal(oc[oc.indexOf('--variant') + 1], 'high');
  assert.ok(oc.includes('--thinking'));
  assert.ok(oc.at(-1).endsWith('\n\nhalo'), 'prompt tetap argumen terakhir');
  // Mode terminal tidak pernah menerima effort dari GUI.
  assert.ok(!buildInteractiveCommand({ agentId: 'claude', executable: 'claude', cwd: 'D:/p', effort: 'max' }).args.includes('--effort'));
});

test('chat GUI: aturan penalaran — system prompt (claude/codex) atau prefiks prompt (agy/opencode)', () => {
  const claude = buildHeadlessCommand({ ...base, agentId: 'claude', executable: 'claude', chatRules: true }).args;
  const sys = claude[claude.indexOf('--append-system-prompt') + 1];
  assert.ok(sys.startsWith(LANGUAGE_RULE) && sys.includes(CHAT_REASONING_RULE));
  const codex = buildHeadlessCommand({ ...base, agentId: 'codex', executable: 'codex', chatRules: true }).args;
  const dev = codex.find((a) => a.startsWith('developer_instructions='));
  // Nilai harus basic string TOML yang valid (newline di-escape).
  assert.ok(dev && !dev.includes('\n') && JSON.parse(dev.slice('developer_instructions='.length)).includes(CHAT_REASONING_RULE));
  const agy = buildHeadlessCommand({ ...base, agentId: 'antigravity', executable: 'agy', chatRules: true }).args;
  assert.ok(agy[1].includes(CHAT_REASONING_RULE) && agy[1].endsWith('\n\nhalo'));
});

test('chat GUI: lampiran native — codex --image=, opencode --file= sebelum flag lain', () => {
  const imgs = ['D:/proj/.soraja/attachments/u1/01-a.png', 'D:/proj/.soraja/attachments/u1/02-b.png'];
  const codex = buildHeadlessCommand({ ...base, agentId: 'codex', executable: 'codex', imagePaths: imgs }).args;
  assert.deepEqual(codex.slice(0, 4), ['exec', `--image=${imgs[0]}`, `--image=${imgs[1]}`, '--json']);
  assert.equal(codex.at(-1), 'halo');
  const resumed = buildHeadlessCommand({ ...base, agentId: 'codex', executable: 'codex', cliSessionId: 't1', imagePaths: imgs.slice(0, 1) }).args;
  assert.deepEqual(resumed.slice(0, 4), ['exec', 'resume', `--image=${imgs[0]}`, '--json']);
  const oc = buildHeadlessCommand({ ...base, agentId: 'opencode', executable: 'opencode', imagePaths: imgs.slice(0, 1), filePaths: ['D:/x/laporan.pdf'] }).args;
  assert.deepEqual(oc.slice(0, 4), ['run', `--file=${imgs[0]}`, '--file=D:/x/laporan.pdf', '--format']);
});

test('prompt berawalan "-" tidak dibaca sebagai flag CLI', () => {
  const cmd = buildHeadlessCommand({ ...base, agentId: 'claude', executable: 'claude', prompt: '--help tolong' });
  assert.equal(cmd.args[1], ' --help tolong');
});
