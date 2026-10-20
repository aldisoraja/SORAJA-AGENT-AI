import type { ConversationRecord } from '../../types/database';
import { activityTime, INDO_MONTHS } from '../../utils/relativeTime.ts';

export interface ConversationGroup {
  /** Judul grup (kunci & teks header), mis. "Hari Ini", "7 Hari Terakhir", "September 2025". */
  label: string;
  items: ConversationRecord[];
}

/** Waktu aktivitas terakhir untuk pengurutan (tanggal tidak valid dianggap paling lama). */
const sortTime = (c: ConversationRecord) => activityTime(c) ?? 0;

/** Percakapan terbaru di atas. */
export function sortByActivity(convs: ConversationRecord[]): ConversationRecord[] {
  return [...convs].sort((a, b) => sortTime(b) - sortTime(a));
}

/**
 * Mengelompokkan riwayat percakapan (modal Riwayat): Hari Ini, Kemarin, 7 Hari Terakhir, 30 Hari Terakhir,
 * lalu per Bulan & Tahun. Sidebar proyek memakai daftar rata dengan waktu relatif.
 */
export function groupConversationsByDate(convs: ConversationRecord[] | null, now = Date.now()): ConversationGroup[] {
  if (!convs || convs.length === 0) return [];

  const today = new Date(now);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const oneDayMs = 86400000;
  const groups = new Map<string, ConversationGroup>();

  for (const conv of sortByActivity(convs)) {
    const date = new Date(activityTime(conv) ?? now);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const label =
      dayStart >= todayStart
        ? 'Hari Ini'
        : dayStart >= todayStart - oneDayMs
          ? 'Kemarin'
          : dayStart >= todayStart - 6 * oneDayMs
            ? '7 Hari Terakhir'
            : dayStart >= todayStart - 29 * oneDayMs
              ? '30 Hari Terakhir'
              : `${INDO_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    // Percakapan sudah terurut terbaru → urutan kemunculan grup = urutan tampil.
    if (!groups.has(label)) groups.set(label, { label, items: [] });
    groups.get(label)!.items.push(conv);
  }
  return [...groups.values()];
}
