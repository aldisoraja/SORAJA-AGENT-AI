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
  'Selalu jawab, jelaskan, dan rangkum dalam Bahasa Indonesia yang jelas dan ramah. Istilah teknis (function, hook, endpoint, dll.) boleh tetap dalam bahasa aslinya. Jangan gunakan simbol § saat merujuk bagian dokumen; tulis bagian N (misalnya bagian 7).';

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
  /** Khusus Claude headless mode aman: URL MCP jembatan izin Soraja (IPC `prepare_permission_bridge`). */
  permissionPromptUrl?: string;
  /**
   * Khusus headless: aksi yang tadi ditolak lalu diizinkan pengguna ("Izinkan & ulangi") untuk satu giliran.
   * Claude: `--allowedTools` persis untuk aksi itu; CLI lain tidak punya allow-list per tool sehingga giliran ini
   * berjalan dengan izin penuh (setara mode otonom).
   */
  grantedActions?: string[];
  /**
   * Khusus Antigravity headless mode aman: Soraja menangani perintah yang ditolak lewat modal HITL lalu
   * melanjutkan sesi (aplikasi Tauri). Agen diberi tahu untuk tetap mencoba perintah, bukan menghindarinya.
   */
  agyHitl?: boolean;
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
  // Opsional: Kiro headless (Chat GUI) berjalan dengan sesi `kiro-cli login` (diuji 16 Okt 2026).
  kiro: ['KIRO_API_KEY'],
};

/** Tool Kiro v3 yang dipercaya di mode aman Chat GUI (baca/cari/ubah berkas; tanpa shell & hapus). */
export const KIRO_SAFE_TOOLS = ['read_file', 'list_directory', 'file_search', 'grep_search', 'fs_write', 'fs_append', 'str_replace'];

/** Petunjuk mode aman Antigravity headless: perintah shell selalu ditolak, tool berkas bawaan tetap jalan. */
export const AGY_SAFE_MODE_RULE =
  'Perintah terminal/shell (RunCommand) otomatis ditolak di sesi ini. Gunakan hanya tool bawaan untuk membaca, mencari, dan mengubah berkas; jangan menjalankan perintah. Bila sebuah langkah benar-benar butuh perintah, tetap selesaikan bagian lain lalu sebutkan perintah yang perlu dijalankan pengguna.';

/** Tool MCP jembatan izin Soraja (`permission_bridge.rs`) untuk `--permission-prompt-tool` Claude. */
export const PERMISSION_PROMPT_TOOL = 'mcp__soraja__approval_prompt';

/** Batas waktu tool MCP Claude (ms): pengguna boleh menimbang permintaan izin selama apa pun dalam sehari. */
const PERMISSION_PROMPT_TIMEOUT_MS = '86400000';

/** Antigravity + HITL Soraja: perintah yang ditolak dimintakan izin ke pengguna lalu sesi dilanjutkan otomatis. */
export const AGY_HITL_RULE =
  'Perintah terminal/shell (RunCommand) yang belum diizinkan akan dihentikan sementara untuk dimintakan persetujuan pengguna, lalu percakapan ini dilanjutkan. Bila sebuah langkah butuh perintah, jalankan satu perintah persis seperti yang dibutuhkan (jangan dirangkai dengan && atau ;) dan jangan mencari jalan lain.';

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
  // agy headless mengakhiri SELURUH giliran tanpa jawaban begitu satu perintah shell ditolak (`denied_actions`).
  if (agentId === 'antigravity' && o.permissionMode !== 'autonomous' && !o.grantedActions?.length) {
    prefixes.push(`[Mode aman] ${o.agyHitl ? AGY_HITL_RULE : AGY_SAFE_MODE_RULE}`);
  }
  const full = prefixes.length > 0 ? `${prefixes.join('\n\n')}\n\n${prompt}` : prompt;
  // Prompt berawalan "-" akan dibaca CLI sebagai flag; spasi di depan menjadikannya argumen posisi.
  return full.startsWith('-') ? ` ${full}` : full;
}

/** `--image=<path>` / `--file=<path>`: bentuk `=` mencegah opsi variadik menelan argumen prompt. */
function attachFlags(flag: string, paths: string[] = []): string[] {
  return paths.map((p) => `${flag}=${p}`);
}

/**
 * Berkas biner yang ditolak `opencode run --file` ("Cannot read binary file" → exit 1, jawaban tampil gagal).
 * Path-nya tetap tercantum di prompt; dokumen Office dikirim lewat teks hasil ekstraksi.
 */
const OPENCODE_BINARY_FILE = /\.(docx?|docm|xlsx?|xlsm|pptx?|pptm|odt|ods|odp|zip|rar|7z|exe|dll|bin)$/i;

/** Mode Chat GUI: CLI non-interaktif dengan output NDJSON. */
export function buildHeadlessCommand(o: CliLaunchOptions): CliCommand {
  const agentId = normalizeAgentId(o.agentId);
  if (!agentId) throw new Error(`Agen CLI tidak dikenal: ${o.agentId}`);
  const autonomous = o.permissionMode === 'autonomous';
  // CLI tanpa allow-list per tool: aksi yang diizinkan ulang = izin penuh untuk giliran ini saja.
  const elevated = autonomous || (!!o.grantedActions?.length && agentId !== 'claude');
  const prompt = headlessPrompt(agentId, o);
  const args: string[] = [];
  const envs = baseEnvs(agentId, o);

  switch (agentId) {
    case 'antigravity':
      args.push('-p', prompt, '--output-format', 'stream-json', '--add-dir', o.cwd);
      args.push(...(elevated ? ['--dangerously-skip-permissions'] : ['--mode', 'accept-edits']));
      if (o.cliSessionId) args.push('--conversation', o.cliSessionId);
      args.push(...sharedArgs(agentId, o), ...effortArgs(agentId, o.effort));
      break;
    case 'claude':
      args.push('-p', prompt, '--output-format', 'stream-json', '--verbose');
      // Opsi variadik (`--allowedTools`, `--mcp-config`) selalu diikuti flag lain agar tidak menelan argumen.
      if (!autonomous && o.grantedActions?.length) args.push('--allowedTools', ...o.grantedActions);
      args.push('--permission-mode', autonomous ? 'bypassPermissions' : 'acceptEdits');
      if (!autonomous && o.permissionPromptUrl) {
        // Aksi di luar acceptEdits ditanyakan ke pengguna lewat modal HITL Soraja, bukan langsung ditolak.
        const mcpConfig = { mcpServers: { soraja: { type: 'http', url: o.permissionPromptUrl } } };
        args.push('--mcp-config', JSON.stringify(mcpConfig), '--permission-prompt-tool', PERMISSION_PROMPT_TOOL);
        envs.MCP_TOOL_TIMEOUT = PERMISSION_PROMPT_TIMEOUT_MS;
      }
      if (o.cliSessionId) args.push('--resume', o.cliSessionId);
      args.push(...sharedArgs(agentId, o), ...effortArgs(agentId, o.effort));
      break;
    case 'codex':
      // `codex exec resume` tidak menerima -C / --approve-for-me: cwd diatur oleh proses.
      args.push('exec');
      if (o.cliSessionId) args.push('resume');
      args.push(...attachFlags('--image', o.imagePaths));
      args.push('--json', '--skip-git-repo-check');
      if (elevated) args.push('--dangerously-bypass-approvals-and-sandbox');
      else if (!o.cliSessionId) args.push('--approve-for-me');
      if (!o.cliSessionId) args.push('-C', o.cwd);
      args.push(...sharedArgs(agentId, o), ...effortArgs(agentId, o.effort));
      if (o.cliSessionId) args.push(o.cliSessionId);
      args.push(prompt);
      break;
    case 'opencode':
      args.push(
        'run',
        ...attachFlags('--file', [...(o.imagePaths ?? []), ...(o.filePaths ?? []).filter((p) => !OPENCODE_BINARY_FILE.test(p))])
      );
      args.push('--format', 'json', '--dir', o.cwd);
      if (elevated) args.push('--auto');
      if (o.cliSessionId) args.push('-s', o.cliSessionId);
      args.push(...sharedArgs(agentId, o), ...effortArgs(agentId, o.effort), prompt);
      break;
    case 'kiro':
      // Flag hanya berlaku di subcommand `chat`; stream-json butuh engine v2/v3 (kiro.dev/docs/cli/headless).
      args.push('chat', '--no-interactive', '--output-format', 'stream-json', '--agent-engine', 'v3');
      // Mode aman = setara agen lain: baca, cari & ubah berkas diizinkan; shell & hapus berkas tetap ditolak
      // (non-interaktif). ID tool engine v3 (KAS) diverifikasi dari kiro-cli 2.31, 16 Okt 2026.
      args.push(elevated ? '--trust-all-tools' : `--trust-tools=${KIRO_SAFE_TOOLS.join(',')}`);
      if (o.cliSessionId) args.push('--resume-id', o.cliSessionId);
      args.push(...sharedArgs(agentId, o), prompt);
      break;
  }
  return { executable: o.executable, args, envs };
}

/** Agen yang punya protokol JSON-RPC stdio dengan permintaan izin (HITL Chat GUI mode aman). */
export const RPC_HITL_AGENTS: CliAgentId[] = ['codex', 'opencode', 'kiro'];

export interface RpcCommand extends CliCommand {
  /** Prompt akhir (dengan prefiks aturan untuk agen tanpa system prompt). */
  prompt: string;
  /** Aturan bahasa + Chat GUI untuk agen yang menerimanya lewat protokol (Codex `developerInstructions`). */
  instructions?: string;
  /** Model yang dikirim lewat protokol (`session/set_model` / `thread/start`); kosong = bawaan CLI. */
  modelId?: string;
}

/**
 * Mode Chat GUI aman dengan HITL: `codex app-server` / `opencode acp` / `kiro-cli acp` (JSON-RPC lewat stdin/stdout).
 * Prompt dan model dikirim lewat protokol oleh driver (`codexAppServer.ts`, `acpDriver.ts`).
 */
export function buildRpcCommand(o: CliLaunchOptions): RpcCommand {
  const agentId = normalizeAgentId(o.agentId);
  if (!agentId || !RPC_HITL_AGENTS.includes(agentId)) throw new Error(`Agen tanpa protokol izin: ${o.agentId}`);
  const envs = baseEnvs(agentId, o);
  const modelId = hasModel(o.modelId, agentId) ? o.modelId : undefined;
  if (agentId === 'codex') {
    return { executable: o.executable, args: ['app-server'], envs, prompt: o.prompt ?? '', instructions: systemRules(o) || undefined, modelId };
  }
  if (agentId === 'kiro') {
    // Engine v3 menolak `--trust-tools` & `--model`: tool aman diizinkan otomatis oleh driver (KIRO_SAFE_TOOLS),
    // model dipilih lewat `session/set_model`.
    return { executable: o.executable, args: ['acp', '--agent-engine', 'v3'], envs, prompt: headlessPrompt(agentId, o).trimStart(), modelId };
  }
  // OpenCode: perintah shell selalu ditanyakan (mode aman Soraja); aturan bahasa tetap lewat `instructions`.
  const config = JSON.parse(envs.OPENCODE_CONFIG_CONTENT ?? '{}') as Record<string, unknown>;
  envs.OPENCODE_CONFIG_CONTENT = JSON.stringify({ ...config, permission: { bash: 'ask' } });
  return { executable: o.executable, args: ['acp'], envs, prompt: headlessPrompt(agentId, o).trimStart(), modelId };
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
