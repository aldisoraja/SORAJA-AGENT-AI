import type {
  ProjectRecord,
  ConversationRecord,
  MessageRecord,
  AppSettings,
  CredentialRecord,
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
  uiScale: 'default',
  reduceMotion: false,
  notifyOnFinish: true,
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
  kiro: emptyCredential('kiro'),
};
