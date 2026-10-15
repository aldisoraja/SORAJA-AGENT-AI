/**
 * conversationTitle.ts
 * Aturan sesi percakapan: sesi chat dibuat saat input pertama (judul dari input itu), sesi CLI
 * dibedakan lewat prefiks id, dan app yang dibuka kembali melanjutkan sesi chat terakhir bila dibuat hari ini.
 */
import type { ConversationRecord } from '../types/database';

const MAX_TITLE_LENGTH = 60;

/** Sesi CLI selalu berid `conv-cli-*` (dibuat saat membuka tab terminal); judul tidak dipakai sebagai penanda. */
export function isCliConversation(conv?: Pick<ConversationRecord, 'id'> | null): boolean {
  return !!conv && conv.id.startsWith('conv-cli-');
}

export const NEW_CHAT_TITLE = 'Percakapan baru';

/** Judul sementara sesi kosong ("Percakapan baru", "Percakapan baru (2)", ...); diganti saat pesan pertama dikirim. */
export function isPlaceholderTitle(title: string): boolean {
  return /^Percakapan baru( \(\d+\))?$/i.test(title.trim());
}

/** Judul bawaan sesi CLI ("Sesi Claude CLI"); diganti "CLI · <input pertama>" saat pengguna mengetik di terminal. */
export function isCliPlaceholderTitle(title: string): boolean {
  return /^Sesi .+ CLI$/i.test(title.trim());
}

/** Label sesi CLI dari input pertama di terminal. */
export function cliTitleFromInput(line: string): string {
  return `CLI · ${titleFromPrompt(line, 'sesi')}`;
}

/** Judul dari input pertama: baris pertama berisi, spasi dirapikan, maks. 60 karakter. */
export function titleFromPrompt(prompt: string, fallback = NEW_CHAT_TITLE): string {
  const firstLine =
    prompt
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .find((l) => l.length > 0) ?? '';
  if (!firstLine) return fallback;
  return firstLine.length > MAX_TITLE_LENGTH ? `${firstLine.slice(0, MAX_TITLE_LENGTH - 3)}...` : firstLine;
}

/** Penyimpanan menolak judul kembar dalam satu proyek; beri akhiran " (2)", " (3)", ... bila bentrok. */
export function uniqueConversationTitle(title: string, existingTitles: string[]): string {
  const taken = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
  if (!taken.has(title.trim().toLowerCase())) return title;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const base = title.length + suffix.length > MAX_TITLE_LENGTH ? title.slice(0, MAX_TITLE_LENGTH - suffix.length) : title;
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate.trim().toLowerCase())) return candidate;
  }
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Sesi chat terbaru proyek yang aktif hari ini (null → tampilkan draf kosong). Sesi CLI tidak dihitung. */
export function pickResumableChat(
  convs: ConversationRecord[],
  projectId: string,
  now: Date = new Date()
): ConversationRecord | null {
  const stamp = (c: ConversationRecord) => new Date(c.updatedAt || c.createdAt || 0).getTime() || 0;
  const candidates = convs
    .filter((c) => c.projectId === projectId && !isCliConversation(c))
    .filter((c) => sameLocalDay(new Date(stamp(c)), now))
    .sort((a, b) => stamp(b) - stamp(a));
  return candidates[0] ?? null;
}
