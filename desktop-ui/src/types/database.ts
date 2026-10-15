// ============================================================================
// SORAJA ENGINE - DATABASE DATA CONTRACTS & MODELS
// ============================================================================

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  branch: string;
  color: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  projectId: string;
  title: string;
  agentId: string;
  modelId: string;
  status: 'active' | 'completed' | 'thinking';
  /** Id sesi milik CLI agen (claude session_id, codex thread_id, dll.) untuk resume. */
  cliSessionId?: string;
  timeAgo: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttachedFile {
  id: string;
  name: string;
  size: string;
  type: 'image' | 'pdf' | 'word' | 'excel' | 'doc';
  /** Thumbnail ringan untuk tampilan (disimpan di riwayat). */
  previewUrl?: string;
  /** Data penuh (data URL) sebelum dikirim; dibuang sebelum pesan disimpan agar kuota tidak penuh. */
  dataUrl?: string;
  /** Path absolut berkas lampiran yang dibaca CLI agen (`.soraja/attachments/<pesan>/`). */
  savedPath?: string;
}

export interface CodeEditChunk {
  file: string;
  relativePath: string;
  additions: number;
  deletions: number;
  diffLines: Array<{
    type: 'context' | 'added' | 'deleted' | 'collapsed';
    oldLineNo?: number;
    newLineNo?: number;
    text: string;
    collapsedCount?: number;
  }>;
}

export type StepStatus = 'running' | 'done' | 'error';

export interface TrajectoryStep {
  type: 'explored' | 'edited' | 'running' | 'thought' | 'analyzed' | 'command' | 'tool';
  label: string;
  count?: number;
  file?: string;
  fileType?: string;
  lineRange?: string;
  additions?: number;
  deletions?: number;
  command?: string;
  duration?: string;
  diff?: CodeEditChunk;
  thoughtContent?: string;
  /** Status langkah tool di mode CLI headless. */
  status?: StepStatus;
  /** Id panggilan tool dari CLI (korelasi event running → done). */
  toolId?: string;
  /** Nama tool asli dari CLI (Read, Bash, view_file, …). */
  toolName?: string;
  /** Ringkasan argumen tool (pola pencarian, URL, dll.). */
  detail?: string;
  /** Cuplikan keluaran tool (dipotong). */
  output?: string;
  startedAt?: number;
  endedAt?: number;
}

/** Status satu jawaban agen di Chat GUI. */
export type AgentRunStatus = 'running' | 'done' | 'error' | 'stopped';

export interface AgentRunInfo {
  workspace?: string;
  permission?: 'safe' | 'autonomous';
  effort?: ChatReasoningEffort;
  resumedSession?: string;
  /** Jumlah lampiran yang diteruskan ke CLI sebagai berkas. */
  attachmentCount?: number;
  /** true bila jawaban dari mesin cadangan lokal, bukan CLI sungguhan. */
  fallback?: boolean;
  fallbackReason?: string;
}

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
  /** Kredit yang dipakai (Kiro melaporkan kredit, bukan token/USD). */
  credits?: number;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  sender: 'user' | 'agent' | 'system';
  content: string;
  reasoning?: string;
  attachments?: AttachedFile[];
  toolCall?: {
    name: string;
    command: string;
    status: 'running' | 'success' | 'blocked';
  };
  trajectory?: TrajectoryStep[];
  codeEdits?: CodeEditChunk[];
  timestamp: string;
  /** Identitas agen & model yang menjawab (riwayat tetap benar walau agen aktif berganti). */
  agentId?: string;
  agentName?: string;
  modelName?: string;
  status?: AgentRunStatus;
  startedAt?: number;
  finishedAt?: number;
  usage?: AgentUsage;
  runInfo?: AgentRunInfo;
  /** Baris log non-JSON dari CLI (stderr), ditampilkan terpisah dari penalaran. */
  logs?: string[];
}

/** Kedalaman penalaran agen di Chat GUI (dikirim sebagai flag effort CLI). */
export type ChatReasoningEffort = 'high' | 'xhigh' | 'max';

export interface AppSettings {
  queuedMessages: 'Queue' | 'Send Immediately';
  securityPreset: 'Default' | 'Strict' | 'Permissive' | 'Custom';
  planReviewPolicy: 'Always Ask' | 'Agent Decides' | 'Never Ask';
  browserJsPolicy: 'Request Review' | 'Always Allow' | 'Deny';
  theme: 'dark' | 'light' | 'system';
  contrast: 'default' | 'strong';
  themePreset: string;
  backgroundColor: string;
  foregroundColor: string;
  accentColor: string;
  verboseAgentChat: boolean;
  /** Kedalaman penalaran Chat GUI (lebih dalam dari default Terminal CLI). */
  chatReasoningEffort: ChatReasoningEffort;
  conversationWidth: 'narrow' | 'default' | 'wide';
  logLevel: 'Debug' | 'Info' | 'Warn' | 'Error';
  autoUpdates: boolean;
  dataStoragePath: string;
  networkAllowedUrls: string[];
  sandboxCommandsWhitelist: string[];
}

export interface CredentialRecord {
  provider: string;
  isConnected: boolean;
  email?: string;
  token?: string;
  tokenMasked?: string;
  /** Nama paket dari CLI, mis. "Pro", "Max", "Plus", "Free", "Multi-provider". Kosong = tidak diketahui. */
  planTier?: string;
  /** Nama pemilik akun yang login di CLI. */
  accountName?: string;
  /** Label paket lengkap dari CLI, mis. "Claude Pro", "ChatGPT Free". */
  accountType?: string;
  /** 'subscription' | 'api_key' | 'multi_provider' | 'none' */
  authMethod?: string;
  /** true bila CLI melaporkan kuota (jendela 5 jam / mingguan). */
  quotaKnown?: boolean;
  /** Panjang jendela kuota panjang (10080 = mingguan, 43200 = 30 hari). */
  weeklyWindowMinutes?: number;
  statusMessage?: string;
  /** Berkas/perintah CLI sumber data profil & kuota. */
  profileSource?: string;
  weeklyLimitPercent?: number;
  fiveHourLimitPercent?: number;
  weeklyRefreshTime?: string;
  fiveHourRefreshTime?: string;
  weeklyResetTimestamp?: number;
  fiveHourResetTimestamp?: number;
  usedWeeklyTokens?: number;
  totalWeeklyTokens?: number;
  usedFiveHourTokens?: number;
  totalFiveHourTokens?: number;
  enableCreditOverages?: boolean;
  updatedAt: string;
}

export interface ScheduledTaskRecord {
  id: string;
  name: string;
  schedule: string;
  status: 'Active' | 'Idle' | 'Paused';
  lastRun: string;
  nextRun: string;
}

/**
 * Menghitung dan memformat sisa waktu reset kuota secara dinamis berbasis timestamp nyata
 */
export function formatRemainingTime(targetTimestamp?: number): string {
  if (!targetTimestamp) return 'Belum terjadwal';
  const diffMs = targetTimestamp - Date.now();
  if (diffMs <= 0) return 'Siap direset';
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} hari, ${hours} jam`;
  if (hours > 0) return `${hours} jam, ${minutes} menit`;
  return `${Math.max(1, minutes)} menit`;
}
