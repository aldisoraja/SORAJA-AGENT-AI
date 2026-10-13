import type {
  ProjectRecord,
  ConversationRecord,
  MessageRecord,
  AppSettings,
  CredentialRecord,
  ScheduledTaskRecord,
} from '../types/database';

export const INITIAL_GENUINE_PROJECTS: ProjectRecord[] = [];
export const INITIAL_GENUINE_CONVERSATIONS: ConversationRecord[] = [];
export const INITIAL_GENUINE_MESSAGES: MessageRecord[] = [];

export const DEFAULT_SETTINGS: AppSettings = {
  queuedMessages: 'Queue',
  securityPreset: 'Default',
  planReviewPolicy: 'Always Ask',
  browserJsPolicy: 'Request Review',
  theme: 'dark',
  contrast: 'default',
  themePreset: 'Default Dark',
  backgroundColor: '#07090e',
  foregroundColor: '#e2e8f0',
  accentColor: '#06b6d4',
  verboseAgentChat: true,
  chatReasoningEffort: 'high',
  conversationWidth: 'default',
  logLevel: 'Info',
  autoUpdates: true,
  dataStoragePath: '%USERPROFILE%\\.soraja\\engine',
  networkAllowedUrls: [
    'https://github.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://api.anthropic.com/*',
    'http://localhost:*',
  ],
  sandboxCommandsWhitelist: [
    'git status',
    'git worktree list',
    'cargo check',
    'cargo test',
    'pnpm dev',
    'npm test',
  ],
};

/**
 * Kredensial awal: semua agen "belum terhubung" tanpa paket/kuota.
 * Status login, paket & kuota diisi dinamis dari CLI (get_user_cli_profile / get_agent_token_stats).
 */
const emptyCredential = (provider: string): CredentialRecord => ({
  provider,
  isConnected: false,
  enableCreditOverages: false,
  updatedAt: new Date().toISOString(),
});

export const DEFAULT_CREDENTIALS: Record<string, CredentialRecord> = {
  antigravity: emptyCredential('antigravity'),
  claude: emptyCredential('claude'),
  codex: emptyCredential('codex'),
  opencode: emptyCredential('opencode'),
};

export const DEFAULT_SCHEDULED_TASKS: ScheduledTaskRecord[] = [
  {
    id: 'task-wal-chk',
    name: 'SQLite WAL Checkpoint Optimization',
    schedule: 'Setiap 6 jam',
    status: 'Active',
    lastRun: '1 jam lalu',
    nextRun: 'Dalam 5 jam',
  },
  {
    id: 'task-wt-gc',
    name: 'Git Worktree Garbage Collection',
    schedule: 'Setiap hari 00:00',
    status: 'Active',
    lastRun: 'Kemarin',
    nextRun: 'Malam ini',
  },
  {
    id: 'task-dpapi-sync',
    name: 'DPAPI Credential Keyring Refresh',
    schedule: 'Saat startup & reload',
    status: 'Active',
    lastRun: 'Saat boot',
    nextRun: 'Saat restart',
  },
];
