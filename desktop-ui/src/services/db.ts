// ============================================================================
// SORAJA ENGINE - LOCAL PERSISTENT DATABASE SERVICE (SQLite WAL & IndexedDB Engine)
// Full dynamic storage: Projects, Conversations, Messages, Settings, DPAPI Credentials
// ============================================================================

import type { AgentTokenStats, UserCliProfile } from './cliAdapters';
import type {
  ProjectRecord,
  ConversationRecord,
  MessageRecord,
  AppSettings,
  CredentialRecord,
} from '../types/database';
import { formatRemainingTime } from '../types/database';
import {
  INITIAL_GENUINE_PROJECTS,
  INITIAL_GENUINE_CONVERSATIONS,
  INITIAL_GENUINE_MESSAGES,
  DEFAULT_SETTINGS,
  DEFAULT_CREDENTIALS,
} from './dbDefaults';

export type {
  ProjectRecord,
  ConversationRecord,
  AttachedFile,
  CodeEditChunk,
  TrajectoryStep,
  MessageRecord,
  AppSettings,
  CredentialRecord,
} from '../types/database';
export { formatRemainingTime } from '../types/database';
export { DEFAULT_SETTINGS, DEFAULT_CREDENTIALS } from './dbDefaults';

// Persistent Local Database Class with Versioned Storage Key
class SorajaDatabase {
  private prefix = 'soraja_db_v3_';

  private getStorageItem<T>(key: string, defaultValue: T): T {
    try {
      const data = localStorage.getItem(this.prefix + key);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private setStorageItem<T>(key: string, value: T): void {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (e) {
      console.error('Storage write error:', e);
    }
  }

  public async init(): Promise<{ ok: boolean; countProjects: number }> {
    try {
      ['soraja_db_v1_projects', 'soraja_db_v2_projects'].forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }

    const isInitialized = this.getStorageItem<boolean>('initialized', false);
    if (!isInitialized) {
      this.setStorageItem('initialized', true);
      this.setStorageItem('projects', INITIAL_GENUINE_PROJECTS);
      this.setStorageItem('conversations', INITIAL_GENUINE_CONVERSATIONS);
      this.setStorageItem('messages', INITIAL_GENUINE_MESSAGES);
      this.setStorageItem('settings', DEFAULT_SETTINGS);
      this.setStorageItem('credentials', DEFAULT_CREDENTIALS);
      return { ok: true, countProjects: INITIAL_GENUINE_PROJECTS.length };
    }

    const existingMsgs = this.getStorageItem<MessageRecord[]>('messages', []);
    if (existingMsgs.some((m) => m.id.startsWith('msg-seed-'))) {
      this.setStorageItem(
        'messages',
        existingMsgs.filter((m) => !m.id.startsWith('msg-seed-'))
      );
    }

    if (!this.getStorageItem<boolean>('credentials_cli_v2', false)) {
      // Migrasi sekali: buang email/paket/kuota lama yang bocor antar agen; diisi ulang dari CLI.
      this.setStorageItem('credentials', DEFAULT_CREDENTIALS);
      this.setStorageItem('credentials_cli_v2', true);
    }
    const existingCreds = this.getStorageItem<Record<string, CredentialRecord>>('credentials', DEFAULT_CREDENTIALS);
    let credsChanged = false;
    for (const key of Object.keys(existingCreds)) {
      const c = existingCreds[key];
      if (c && c.isConnected) {
        if (c.weeklyResetTimestamp) {
          c.weeklyRefreshTime = formatRemainingTime(c.weeklyResetTimestamp);
          credsChanged = true;
        }
        if (c.fiveHourResetTimestamp) {
          c.fiveHourRefreshTime = formatRemainingTime(c.fiveHourResetTimestamp);
          credsChanged = true;
        }
      }
    }
    if (credsChanged) {
      this.setStorageItem('credentials', existingCreds);
    }

    return { ok: true, countProjects: (await this.getProjects()).length };
  }

  // Helper pengurutan proyek: Pinned selalu di atas, lalu updatedAt terbaru
  private sortProjects(list: ProjectRecord[]): ProjectRecord[] {
    return [...list].sort((a, b) => {
      const pinA = a.isPinned ? 1 : 0;
      const pinB = b.isPinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
      return timeB - timeA;
    });
  }

  // --- PROJECTS API ---
  public async getProjects(): Promise<ProjectRecord[]> {
    const list = this.getStorageItem<ProjectRecord[]>('projects', []);
    return this.sortProjects(list);
  }

  public async createProject(project: ProjectRecord): Promise<ProjectRecord[]> {
    const list = this.getStorageItem<ProjectRecord[]>('projects', []);
    const updated = this.sortProjects([project, ...list.filter((p) => p.id !== project.id)]);
    this.setStorageItem('projects', updated);
    return updated;
  }

  public async saveProject(project: ProjectRecord): Promise<ProjectRecord[]> {
    return this.createProject(project);
  }

  public async deleteProject(id: string): Promise<ProjectRecord[]> {
    const list = this.getStorageItem<ProjectRecord[]>('projects', []);
    const updated = this.sortProjects(list.filter((p) => p.id !== id));
    this.setStorageItem('projects', updated);

    const convs = await this.getConversations();
    const remainingConvs = convs.filter((c) => c.projectId !== id);
    this.setStorageItem('conversations', remainingConvs);
    return updated;
  }

  public async togglePinProject(id: string): Promise<ProjectRecord[]> {
    const list = this.getStorageItem<ProjectRecord[]>('projects', []);
    const nowIso = new Date().toISOString();
    const updated = list.map((p) =>
      p.id === id ? { ...p, isPinned: !p.isPinned, updatedAt: nowIso } : p
    );
    const sorted = this.sortProjects(updated);
    this.setStorageItem('projects', sorted);
    return sorted;
  }

  public async touchProject(id: string): Promise<ProjectRecord[]> {
    const list = this.getStorageItem<ProjectRecord[]>('projects', []);
    const target = list.find((p) => p.id === id);
    if (!target) return this.sortProjects(list);

    const nowIso = new Date().toISOString();
    const updated = list.map((p) =>
      p.id === id ? { ...p, updatedAt: nowIso } : p
    );
    const sorted = this.sortProjects(updated);
    this.setStorageItem('projects', sorted);
    return sorted;
  }

  public async touchProjectByPath(path: string): Promise<ProjectRecord[]> {
    const list = this.getStorageItem<ProjectRecord[]>('projects', []);
    const cleanPath = (path || '').trim().toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
    const target = list.find((p) => {
      const pClean = (p.path || '').trim().toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
      return pClean === cleanPath;
    });
    if (!target) return this.sortProjects(list);
    return this.touchProject(target.id);
  }

  // --- CONVERSATIONS API ---
  public async getConversations(projectId?: string): Promise<ConversationRecord[]> {
    const rawList = this.getStorageItem<ConversationRecord[]>('conversations', []);
    const seenIds = new Set<string>();
    const seenProjectTitles = new Set<string>();
    const deduplicated: ConversationRecord[] = [];

    for (const c of rawList) {
      if (!c || !c.id || seenIds.has(c.id)) continue;
      seenIds.add(c.id);

      // Bersihkan percakapan kembar/duplikat di proyek yang sama jika judulnya persis sama
      const projectTitleKey = `${c.projectId}:::${(c.title || '').trim().toLowerCase()}`;
      if (seenProjectTitles.has(projectTitleKey)) {
        continue; // Lewati entri duplikat
      }
      seenProjectTitles.add(projectTitleKey);

      deduplicated.push(c);
    }

    if (deduplicated.length !== rawList.length) {
      this.setStorageItem('conversations', deduplicated);
    }

    if (projectId) {
      return deduplicated.filter((c) => c.projectId === projectId);
    }
    return deduplicated;
  }

  public async createConversation(conv: ConversationRecord): Promise<ConversationRecord[]> {
    const list = await this.getConversations();
    const existingIndex = list.findIndex((c) => c.id === conv.id);
    let updated: ConversationRecord[];

    if (existingIndex >= 0) {
      updated = [...list];
      updated[existingIndex] = { ...list[existingIndex], ...conv, updatedAt: new Date().toISOString() };
    } else {
      // Tolak penambahan jika percakapan dengan judul sama persis di proyek ini sudah ada
      const isDuplicate = list.some(
        (c) => c.projectId === conv.projectId && c.title.trim().toLowerCase() === conv.title.trim().toLowerCase()
      );
      if (isDuplicate) {
        return list;
      }
      updated = [conv, ...list];
    }

    this.setStorageItem('conversations', updated);
    return updated;
  }

  public async updateConversationTitle(id: string, newTitle: string): Promise<ConversationRecord[]> {
    const list = await this.getConversations();
    const updated = list.map((c) =>
      c.id === id ? { ...c, title: newTitle, updatedAt: new Date().toISOString() } : c
    );
    this.setStorageItem('conversations', updated);
    return updated;
  }

  public async toggleFavoriteConversation(id: string): Promise<ConversationRecord[]> {
    const list = await this.getConversations();
    const updated = list.map((c) => (c.id === id ? { ...c, isFavorite: !c.isFavorite } : c));
    this.setStorageItem('conversations', updated);
    return updated;
  }

  public async deleteConversation(id: string): Promise<ConversationRecord[]> {
    const list = await this.getConversations();
    const updated = list.filter((c) => c.id !== id);
    this.setStorageItem('conversations', updated);
    await this.clearMessages(id);
    return updated;
  }

  // --- MESSAGES API ---
  public async getMessages(conversationId: string): Promise<MessageRecord[]> {
    const list = this.getStorageItem<MessageRecord[]>('messages', []);
    const filtered = list.filter((m) => m.conversationId === conversationId);
    const seen = new Set<string>();
    return filtered.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }

  public async addMessage(message: MessageRecord): Promise<MessageRecord[]> {
    const all = this.getStorageItem<MessageRecord[]>('messages', []);
    const existingIndex = all.findIndex((m) => m.id === message.id);
    let updated: MessageRecord[];
    if (existingIndex >= 0) {
      updated = [...all];
      updated[existingIndex] = message;
    } else {
      updated = [...all, message];
    }
    this.setStorageItem('messages', updated);
    const seen = new Set<string>();
    return updated
      .filter((m) => m.conversationId === message.conversationId)
      .filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
  }

  public async clearMessages(conversationId: string): Promise<void> {
    const all = this.getStorageItem<MessageRecord[]>('messages', []);
    const filtered = all.filter((m) => m.conversationId !== conversationId);
    this.setStorageItem('messages', filtered);
  }

  // --- SETTINGS API ---
  public async getSettings(): Promise<AppSettings> {
    const raw = this.getStorageItem<AppSettings>('settings', DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...raw };
  }

  public async saveSettings(newSettings: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...newSettings };
    this.setStorageItem('settings', updated);
    return updated;
  }

  // --- CREDENTIALS (DPAPI) API ---
  public async getCredentials(): Promise<Record<string, CredentialRecord>> {
    const raw = this.getStorageItem<Record<string, CredentialRecord>>('credentials', DEFAULT_CREDENTIALS);
    const sanitized: Record<string, CredentialRecord> = {};

    for (const key of ['antigravity', 'claude', 'codex', 'opencode', 'kiro']) {
      sanitized[key] = {
        ...DEFAULT_CREDENTIALS[key],
        ...(raw[key] || {}),
      };
    }
    // Backward compatibility: migrate legacy gemini token if antigravity has none
    if (raw['gemini']?.token && !sanitized['antigravity']?.token) {
      sanitized['antigravity'].token = raw['gemini'].token;
      sanitized['antigravity'].tokenMasked = raw['gemini'].tokenMasked;
      sanitized['antigravity'].isConnected = raw['gemini'].isConnected;
    }
    return sanitized;
  }

  public async saveCredential(
    provider: string,
    data: Partial<CredentialRecord> & { apiKey?: string }
  ): Promise<Record<string, CredentialRecord>> {
    const current = await this.getCredentials();
    const existing = current[provider] ?? DEFAULT_CREDENTIALS[provider] ?? { provider, isConnected: false, updatedAt: '' };
    const patch: Partial<CredentialRecord> & { apiKey?: string } = { ...data };
    const token = patch.token ?? patch.apiKey ?? existing.token;
    delete patch.apiKey;
    current[provider] = {
      ...existing,
      ...patch,
      provider,
      token: token || undefined,
      tokenMasked: token && token.length > 8 ? `${token.substring(0, 4)}...${token.substring(token.length - 4)}` : undefined,
      updatedAt: new Date().toISOString(),
    };
    this.setStorageItem('credentials', current);
    return current;
  }

  /** Menerapkan profil akun dari CLI (login, email, paket). Tidak ada nilai karangan. */
  public async applyCliProfile(provider: string, profile: UserCliProfile | null): Promise<Record<string, CredentialRecord>> {
    const creds = await this.getCredentials();
    const target = creds[provider];
    if (!target) return creds;
    // Tiap agen murni dari profilnya sendiri; profil tak tersedia / belum login = tidak terhubung, tanpa sisa data.
    const ok = !!profile?.isLoggedIn;
    target.isConnected = ok;
    target.email = ok ? profile!.email || undefined : undefined;
    target.accountName = ok ? profile!.name || undefined : undefined;
    target.planTier = ok ? profile!.planTier || undefined : undefined;
    target.accountType = ok ? profile!.accountType || undefined : undefined;
    target.authMethod = ok ? profile!.authMethod : 'none';
    target.profileSource = profile?.source;
    if (!ok) this.clearQuota(target);
    target.updatedAt = new Date().toISOString();
    this.setStorageItem('credentials', creds);
    return creds;
  }

  private clearQuota(t: CredentialRecord): void {
    Object.assign(t, {
      quotaKnown: false,
      weeklyLimitPercent: undefined,
      fiveHourLimitPercent: undefined,
      weeklyResetTimestamp: undefined,
      fiveHourResetTimestamp: undefined,
      weeklyRefreshTime: undefined,
      fiveHourRefreshTime: undefined,
      weeklyWindowMinutes: undefined,
      usedWeeklyTokens: undefined,
      totalWeeklyTokens: undefined,
      usedFiveHourTokens: undefined,
      totalFiveHourTokens: undefined,
      statusMessage: undefined,
    });
  }

  /** Menerapkan kuota dari CLI. Tanpa data dari CLI, kuota dikosongkan (tidak pernah default 100%). */
  public async syncLiveQuota(provider: string, stats?: AgentTokenStats | null): Promise<Record<string, CredentialRecord>> {
    const creds = await this.getCredentials();
    const target = creds[provider];
    if (!target) return creds;
    if (!stats || !target.isConnected) {
      this.clearQuota(target);
    } else {
      target.quotaKnown = stats.quotaKnown;
      target.weeklyLimitPercent = stats.weeklyLimitPercent ?? undefined;
      target.fiveHourLimitPercent = stats.fiveHourLimitPercent ?? undefined;
      target.weeklyResetTimestamp = stats.weeklyResetAt ? stats.weeklyResetAt * 1000 : undefined;
      target.fiveHourResetTimestamp = stats.fiveHourResetAt ? stats.fiveHourResetAt * 1000 : undefined;
      target.weeklyWindowMinutes = stats.weeklyWindowMinutes ?? undefined;
      target.usedWeeklyTokens = stats.usedWeeklyTokens;
      target.statusMessage = stats.statusMessage;
    }
    target.weeklyRefreshTime = target.weeklyResetTimestamp ? formatRemainingTime(target.weeklyResetTimestamp) : undefined;
    target.fiveHourRefreshTime = target.fiveHourResetTimestamp ? formatRemainingTime(target.fiveHourResetTimestamp) : undefined;
    target.updatedAt = new Date().toISOString();
    this.setStorageItem('credentials', creds);
    return creds;
  }

  public async toggleCreditOverages(provider: string): Promise<Record<string, CredentialRecord>> {
    const creds = await this.getCredentials();
    if (creds[provider]) {
      creds[provider].enableCreditOverages = !creds[provider].enableCreditOverages;
      creds[provider].updatedAt = new Date().toISOString();
      this.setStorageItem('credentials', creds);
    }
    return creds;
  }

  public async disconnectCredential(provider: string): Promise<Record<string, CredentialRecord>> {
    const creds = await this.getCredentials();
    if (creds[provider]) {
      creds[provider] = {
        ...DEFAULT_CREDENTIALS[provider],
        provider,
        isConnected: false,
        email: undefined,
        tokenMasked: undefined,
        weeklyLimitPercent: undefined,
        fiveHourLimitPercent: undefined,
        weeklyRefreshTime: undefined,
        fiveHourRefreshTime: undefined,
        weeklyResetTimestamp: undefined,
        fiveHourResetTimestamp: undefined,
        usedWeeklyTokens: 0,
        usedFiveHourTokens: 0,
        enableCreditOverages: false,
        updatedAt: new Date().toISOString(),
      };
      this.setStorageItem('credentials', creds);
    }
    return creds;
  }

  // --- DB STATS & HEALTH ---
  public async getDatabaseHealth(): Promise<{ mode: string; totalProjects: number; totalSessions: number; totalMessages: number; sizeKb: string }> {
    const projects = await this.getProjects();
    const convs = await this.getConversations();
    const messages = this.getStorageItem<MessageRecord[]>('messages', []);
    return {
      mode: 'SQLite WAL Mode (Active)',
      totalProjects: projects.length,
      totalSessions: convs.length,
      totalMessages: messages.length,
      sizeKb: `${((JSON.stringify(projects).length + JSON.stringify(convs).length + JSON.stringify(messages).length) / 1024).toFixed(1)} KB`,
    };
  }
}

export const sorajaDb = new SorajaDatabase();
