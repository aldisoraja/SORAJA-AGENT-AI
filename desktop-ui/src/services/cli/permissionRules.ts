/**
 * permissionRules.ts
 * Aturan izin HITL Chat GUI: kunci aturan "selalu izinkan", deteksi perintah berbahaya, dan ringkasan
 * permintaan izin untuk modal. Spesifikasi: specs/agent-protocols.md §7. Modul murni (tanpa import runtime).
 */

const SHELL_TOOLS = /^(bash|powershell|shell|run_command|exec_command)$/i;

/** Keluaran tool yang ditolak pengguna lewat modal HITL (dikenali `isUserRejection` di trajectoryBuilder). */
export const USER_REJECTION_MESSAGE = 'Ditolak oleh pengguna di Soraja.';

/**
 * Pola perintah berbahaya: tidak pernah diizinkan otomatis dan hanya bisa diizinkan sekali.
 * Cerminan `TerminalExecutor::is_destructive_command` (soraja-core) ditambah perintah Git yang menghapus riwayat.
 */
const DESTRUCTIVE = [
  /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i,
  /\bdel\s+\/s/i,
  /\brd\s+\/s|\brmdir\s+\/s/i,
  /Remove-Item\b[^|;&]*-Recurse/i,
  /Format-Volume|\bformat\s+[a-z]:/i,
  />\s*\/dev\/sd[a-z]/i,
  /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|push\s+[^|;&]*(--force|-f\b))/i,
  /\b(shutdown|Stop-Computer|Restart-Computer)\b/i,
];

/** Rangkaian perintah (`&&`, `;`, pipa, substitusi) tidak dicakup aturan "selalu izinkan". */
const CHAINED = /&&|\|\||[;|`]|\$\(/;

export interface PermissionSummary {
  /** Teks yang ditampilkan di kotak pratinjau modal (perintah, path berkas, atau argumen ringkas). */
  preview: string;
  /** Penjelasan singkat dari agen (mis. `description` tool Bash). */
  description?: string;
  /** Kunci aturan "selalu izinkan"; `null` = permintaan ini harus selalu ditanyakan. */
  ruleKey: string | null;
  destructive: boolean;
}

function commandOf(input: Record<string, unknown>): string {
  return typeof input.command === 'string' ? input.command.trim() : '';
}

export function isDestructiveCommand(command: string): boolean {
  return DESTRUCTIVE.some((re) => re.test(command));
}

/**
 * Kunci aturan: perintah shell per program pertamanya (`Bash:npm`), tool lain per nama tool.
 * Perintah berantai / berbahaya tidak punya kunci sehingga selalu ditanyakan.
 */
export function permissionRuleKey(toolName: string, input: Record<string, unknown>): string | null {
  const command = commandOf(input);
  if (!command) return toolName;
  if (!SHELL_TOOLS.test(toolName)) return toolName;
  if (CHAINED.test(command) || isDestructiveCommand(command)) return null;
  const program = command.split(/\s+/)[0].replace(/^["']|["']$/g, '');
  return program ? `${toolName}:${program}` : null;
}

/** Label manusiawi untuk kunci aturan, mis. `Bash:npm` → "perintah npm (Bash)". */
export function ruleLabel(key: string): string {
  const [tool, program] = key.split(':');
  return program ? `perintah ${program} (${tool})` : tool;
}

export function summarizePermissionRequest(toolName: string, input: Record<string, unknown>): PermissionSummary {
  const command = commandOf(input);
  const file = [input.file_path, input.notebook_path, input.path, input.url].find((v) => typeof v === 'string') as string | undefined;
  const preview = command || file || (Object.keys(input).length > 0 ? JSON.stringify(input).slice(0, 400) : toolName);
  return {
    preview,
    description: typeof input.description === 'string' && input.description.trim() ? input.description.trim() : undefined,
    ruleKey: permissionRuleKey(toolName, input),
    destructive: !!command && isDestructiveCommand(command),
  };
}
