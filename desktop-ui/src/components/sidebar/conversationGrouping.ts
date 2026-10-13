import type { ConversationRecord } from '../../types/database';

/** Pengelompokan percakapan per tanggal (Hari ini, Kemarin, 7 hari, bulan & tahun). */
const INDO_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export interface ConversationGroup {
  label: string;
  items: ConversationRecord[];
}

/**
 * Mengelompokkan riwayat percakapan berdasarkan Tanggal, Bulan, dan Tahun
 * Sesuai panduan UI/UX Soraja AI: Hari Ini, Kemarin, 7 Hari Terakhir, atau Bulan & Tahun
 */
export function groupConversationsByDate(convs: ConversationRecord[]): ConversationGroup[] {
  if (!convs || convs.length === 0) return [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDayMs = 86400000;
  const yesterdayStart = todayStart - oneDayMs;
  const sevenDaysStart = todayStart - 6 * oneDayMs;
  const thirtyDaysStart = todayStart - 29 * oneDayMs;

  // Urutkan percakapan dari yang teranyar
  const sorted = [...convs].sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
    return timeB - timeA;
  });

  const map = new Map<string, { label: string; order: number; items: ConversationRecord[] }>();

  for (const conv of sorted) {
    const dateObj = new Date(conv.updatedAt || conv.createdAt || Date.now());
    const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;
    const dayStart = new Date(validDate.getFullYear(), validDate.getMonth(), validDate.getDate()).getTime();
    const day = validDate.getDate();
    const month = INDO_MONTHS[validDate.getMonth()];
    const year = validDate.getFullYear();

    let key: string;
    let label: string;
    let order: number;

    if (dayStart >= todayStart) {
      key = 'today';
      label = `Hari Ini (${day} ${month} ${year})`;
      order = 1;
    } else if (dayStart >= yesterdayStart) {
      key = 'yesterday';
      label = `Kemarin (${day} ${month} ${year})`;
      order = 2;
    } else if (dayStart >= sevenDaysStart) {
      key = 'last7';
      label = `7 Hari Terakhir (${month} ${year})`;
      order = 3;
    } else if (dayStart >= thirtyDaysStart) {
      key = 'last30';
      label = `30 Hari Terakhir (${month} ${year})`;
      order = 4;
    } else {
      key = `${validDate.getFullYear()}-${validDate.getMonth()}`;
      label = `${month} ${year}`;
      order = 1000 + (100000 - (validDate.getFullYear() * 12 + validDate.getMonth()));
    }

    if (!map.has(key)) {
      map.set(key, { label, order, items: [] });
    }
    map.get(key)!.items.push(conv);
  }

  return Array.from(map.values())
    .sort((a, b) => a.order - b.order)
    .map((g) => ({ label: g.label, items: g.items }));
}
