/**
 * agentCommands.ts
 * Pembangun argumen CLI native per agen untuk 2 mode: Chat GUI (headless) & Terminal (PTY).
 * Sumber kebenaran flag: specs/agent-protocols.md §2 (diverifikasi dari `--help` CLI terpasang).
 * Modul ini murni (tanpa import runtime) agar bisa diuji langsung dengan `node --test`.
 */
import { CHAT_REASONING_RULE, type ChatEffort } from './chatPrompt.ts';

export type CliAgentId = 'antigravity' | 'claude' | 'codex' | 'opencode' | 'kiro';
export type PermissionMode = 'safe' | 'autonomous';

/** Aturan bahasa jawaban agen (lihat specs/agent-protocols.md §5). */
export const LANGUAGE_RULE =
  'Selalu jawab, jelaskan, dan rangkum dalam Bahasa Indonesia yang jelas dan ramah. Istilah teknis (function, hook, endpoint, dll.) boleh tetap dalam bahasa aslinya.';

export interface CliLaunchOptions {
  agentId: string;
  executable: string;
  cwd: string;
  prompt?: string;
  modelId?: string;
  /** Id sesi milik CLI untuk melanjutkan percakapan. */
  cliSessionId?: string;
  permissionMode?: PermissionMode;
  /** Paksa jawaban Bahasa Indonesia (default true). */
  forceIndonesian?: boolean;
  /** Path berkas aturan bahasa dari IPC `prepare_agent_language_rules`. */
  languageRulesPath?: string;
  /** API key opsional (mode `api_key`), disuntikkan hanya sebagai env proses anak. */
  apiKey?: string;
  /** Khusus headless: kedalaman penalaran (flag effort CLI). Tidak dikirim bila kosong. */
  effort?: ChatEffort;
  /** Khusus headless: tambahkan CHAT_REASONING_RULE (penalaran mendalam + format jawaban). */
  chatRules?: boolean;
  /** Khusus headless: path absolut gambar lampiran (codex `--image`, opencode `--file`). */
  imagePaths?: string[];
  /** Khusus headless: path absolut dokumen lampiran (opencode `--file`). */
  filePaths?: string[];
}

export interface CliCommand {
  executable: string;
  args: string[];
  envs: Record<string, string>;
}

const API_KEY_ENV: Record<CliAgentId, string[]> = {
  antigravity: ['GEMINI_API_KEY'],
  claude: ['ANTHROPIC_API_KEY'],
  codex: ['OPENAI_API_KEY'],
  opencode: [],
  // Kiro headless (Chat GUI) WAJIB memakai API key (paket Pro ke atas).
  kiro: ['KIRO_API_KEY'],
};

/** Agen tanpa flag system prompt: aturan bahasa & Chat GUI disisipkan di awal prompt headless. */
const PROMPT_PREFIX_AGENTS: CliAgentId[] = ['antigravity', 'kiro'];

export function normalizeAgentId(id: string): CliAgentId | null {
  if (id === 'agy') return 'antigravity';
  if (id === 'kiro-cli') return 'kiro';
  const known: CliAgentId[] = ['antigravity', 'claude', 'codex', 'opencode', 'kiro'];
  return (known as string[]).includes(id) ? (id as CliAgentId) : null;
}

/** Slug/alias model Claude Code yang valid saat ini (mis. claude-sonnet-5-5, sonnet). Slug lama (claude-3-*, *-latest) ditolak akun modern. */
const CLAUDE_MODEL = /^(claude-(opus|sonnet|haiku|fable)-\d+(-\d+)*(-\d{8})?|opus|sonnet|haiku|fable|opusplan)(\[1m\])?$/;

function hasModel(modelId?: string, agentId?: CliAgentId): modelId is string {
  if (!modelId || modelId === 'cli-default') return false;
  // Model tak dikenal (mis. sisa pilihan lama) tidak dikirim: Claude Code memakai model default akun.
  return agentId === 'claude' ? CLAUDE_MODEL.test(modelId) : true;
}

function baseEnvs(agentId: CliAgentId, o: CliLaunchOptions): Record<string, string> {
  const envs: Record<string, string> = {};
  if (o.apiKey) {
    for (const key of API_KEY_ENV[agentId]) envs[key] = o.apiKey;
  }
  if (agentId === 'opencode' && o.forceIndonesian !== false && o.languageRulesPath) {
    envs.OPENCODE_CONFIG_CONTENT = JSON.stringify({ instructions: [o.languageRulesPath] });
  }
  return envs;
}

/** Aturan sistem gabungan (bahasa + aturan Chat GUI) untuk agen yang punya flag system prompt. */
function systemRules(o: CliLaunchOptions): string {
  return [o.forceIndonesian !== false ? LANGUAGE_RULE : '', o.chatRules ? CHAT_REASONING_RULE : '']
    .filter(Boolean)
    .join('\n\n');
}

/** Argumen bersama (model, bahasa) yang berlaku di kedua mode. */
function sharedArgs(agentId: CliAgentId, o: CliLaunchOptions): string[] {
  const args: string[] = [];
  const rules = systemRules(o);
  switch (agentId) {
    case 'antigravity':
      if (hasModel(o.modelId, agentId)) args.push('--model', o.modelId);
      break;
    case 'claude':
      if (hasModel(o.modelId, agentId)) args.push('--model', o.modelId);
      if (rules) args.push('--append-system-prompt', rules);
      break;
    case 'codex':
      if (hasModel(o.modelId, agentId)) args.push('-m', o.modelId);
      // Nilai `-c` diparse sebagai TOML; JSON.stringify menghasilkan basic string TOML yang valid.
      if (rules) args.push('-c', `developer_instructions=${JSON.stringify(rules)}`);
      break;
    case 'opencode':
      if (hasModel(o.modelId, agentId)) args.push('-m', o.modelId);
      break;
    case 'kiro':
      if (hasModel(o.modelId, agentId)) args.push('--model', o.modelId);
      break;
  }
  return args;
}

/** Flag effort per CLI (diverifikasi dari `--help` CLI terpasang, 13 Okt 2026). */
function effortArgs(agentId: CliAgentId, effort?: ChatEffort): string[] {
  if (!effort) return [];
  switch (agentId) {
    case 'claude':
    case 'antigravity':
      return ['--effort', effort];
    case 'codex':
      // Codex: minimal|low|medium|high|xhigh — "max" dipetakan ke xhigh.
      return ['-c', `model_reasoning_effort="${effort === 'max' ? 'xhigh' : effort}"`];
    case 'opencode':
      // Varian reasoning OpenCode bersifat per provider; "high" & "max" paling umum didukung.
      return ['--thinking', '--variant', effort === 'max' ? 'max' : 'high'];
    case 'kiro':
      // Level effort Kiro bergantung model (dilaporkan saat run).
      return [];
  }
}

/**
 * Antigravity tidak punya flag system prompt; OpenCode hanya punya berkas aturan bahasa.
 * Di mode headless aturan untuk keduanya disisipkan di awal prompt.
 */
function headlessPrompt(agentId: CliAgentId, o: CliLaunchOptions): string {
  const prompt = o.prompt ?? '';
  const prefixes: string[] = [];
  if (
    o.forceIndonesian !== false &&
    (PROMPT_PREFIX_AGENTS.includes(agentId) || (agentId === 'opencode' && !o.languageRulesPath))
  ) {
    prefixes.push(`[Instruksi: ${LANGUAGE_RULE}]`);
  }
  if (o.chatRules && (PROMPT_PREFIX_AGENTS.includes(agentId) || agentId === 'opencode')) {
    prefixes.push(`[Instruksi sistem]\n${CHAT_REASONING_RULE}`);
  }
  const full = prefixes.length > 0 ? `${prefixes.join('\n\n')}\n\n${prompt}` : prompt;
  // Prompt berawalan "-" akan dibaca CLI sebagai flag; spasi di depan menjadikannya argumen posisi.
  return full.startsWith('-') ? ` ${full}` : full;
}

/** `--image=<path>` / `--file=<path>`: bentuk `=` mencegah opsi variadik menelan argumen prompt. */
function attachFlags(flag: string, paths: string[] = []): string[] {
  return paths.map((p) => `${flag}=${p}`);
}

/** Mode Chat GUI: CLI non-interaktif dengan output NDJSON. */
export function buildHeadlessCommand(o: CliLaunchOptions): CliCommand {
  const agentId = normalizeAgentId(o.agentId);
  if (!agentId) throw new Error(`Agen CLI tidak dikenal: ${o.agentId}`);
  const autonomous = o.permissionMode === 'autonomous';
  const prompt = headlessPrompt(agentId, o);
  const args: string[] = [];

  switch (agentId) {
    case 'antigravity':
      args.push('-p', prompt, '--output-format', 'stream-json', '--add-dir', o.cwd);
      args.push(...(autonomous ? ['--dangerously-skip-permissions'] : ['--mode', 'accept-edits']));
      if (o.cliSessionId) args.push('--conversation', o.cliSessionId);
      args.push(...sharedArgs(agentId, o), ...effortArgs(agentId, o.effort));
      break;
    case 'claude':
      args.push('-p', prompt, '--output-format', 'stream-json', '--verbose');
      args.push('--permission-mode', autonomous ? 'bypassPermissions' : 'acceptEdits');
      if (o.cliSessionId) args.push('--resume', o.cliSessionId);
      args.push(...sharedArgs(agentId, o), ...effortArgs(agentId, o.effort));
      break;
    case 'codex':
      // `codex exec resume` tidak menerima -C / --approve-for-me: cwd diatur oleh proses.
      args.push('exec');
      if (o.cliSessionId) args.push('resume');
      args.push(...attachFlags('--image', o.imagePaths));
      args.push('--json', '--skip-git-repo-check');
      if (autonomous) args.push('--dangerously-bypass-approvals-and-sandbox');
      else if (!o.cliSessionId) args.push('--approve-for-me');
      if (!o.cliSessionId) args.push('-C', o.cwd);
      args.push(...sharedArgs(agentId, o), ...effortArgs(agentId, o.effort));
      if (o.cliSessionId) args.push(o.cliSessionId);
      args.push(prompt);
      break;
    case 'opencode':
      args.push('run', ...attachFlags('--file', [...(o.imagePaths ?? []), ...(o.filePaths ?? [])]));
      args.push('--format', 'json', '--dir', o.cwd);
      if (autonomous) args.push('--auto');
      if (o.cliSessionId) args.push('-s', o.cliSessionId);
      args.push(...sharedArgs(agentId, o), ...effortArgs(agentId, o.effort), prompt);
      break;
    case 'kiro':
      // Flag hanya berlaku di subcommand `chat`; stream-json butuh engine v2/v3 (kiro.dev/docs/cli/headless).
      args.push('chat', '--no-interactive', '--output-format', 'stream-json', '--agent-engine', 'v3');
      if (autonomous) args.push('--trust-all-tools');
      if (o.cliSessionId) args.push('--resume-id', o.cliSessionId);
      args.push(...sharedArgs(agentId, o), prompt);
      break;
  }
  return { executable: o.executable, args, envs: baseEnvs(agentId, o) };
}

/** Mode Terminal: CLI interaktif (TUI asli) di dalam PTY. */
export function buildInteractiveCommand(o: CliLaunchOptions): CliCommand {
  const agentId = normalizeAgentId(o.agentId);
  if (!agentId) return { executable: o.executable, args: [], envs: {} };
  const args: string[] = [];

  switch (agentId) {
    case 'antigravity':
      if (o.cliSessionId) args.push('--conversation', o.cliSessionId);
      break;
    case 'claude':
      if (o.cliSessionId) args.push('--resume', o.cliSessionId);
      break;
    case 'codex':
      if (o.cliSessionId) args.push('resume', o.cliSessionId);
      break;
    case 'opencode':
      if (o.cliSessionId) args.push('-s', o.cliSessionId);
      break;
    case 'kiro':
      args.push('chat');
      if (o.cliSessionId) args.push('--resume-id', o.cliSessionId);
      break;
  }
  args.push(...sharedArgs(agentId, o));
  return { executable: o.executable, args, envs: baseEnvs(agentId, o) };
}
