import type { ConversationRecord } from '../../types/database';

/** Pengelompokan percakapan per tanggal (Hari ini, Kemarin, 7 hari, bulan & tahun). */
const INDO_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export interface ConversationGroup {
  label: string;
  /** Judul utama grup, mis. "Hari Ini". */
  title: string;
  /** Keterangan hari & tanggal lengkap, mis. "Rabu, 14 Oktober 2026". */
  subtitle?: string;
  /** Lencana kalender mungil: baris atas (bulan/tahun) & baris bawah (tanggal/bulan). */
  badge: { top: string; bottom: string };
  items: ConversationRecord[];
}

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];

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

  const map = new Map<string, { label: string; title: string; subtitle?: string; badge: { top: string; bottom: string }; order: number; items: ConversationRecord[] }>();

  for (const conv of sorted) {
    const dateObj = new Date(conv.updatedAt || conv.createdAt || Date.now());
    const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;
    const dayStart = new Date(validDate.getFullYear(), validDate.getMonth(), validDate.getDate()).getTime();
    const day = validDate.getDate();
    const month = INDO_MONTHS[validDate.getMonth()];
    const year = validDate.getFullYear();

    let key: string;
    let label: string;
    let title: string;
    let subtitle: string | undefined;
    let order: number;
    let badge: { top: string; bottom: string };
    const monthShort = MONTHS_SHORT[validDate.getMonth()];
    const fullDate = `${INDO_DAYS[validDate.getDay()]}, ${day} ${month} ${year}`;

    if (dayStart >= todayStart) {
      key = 'today';
      label = `Hari Ini (${day} ${month} ${year})`;
      title = 'Hari Ini';
      subtitle = fullDate;
      badge = { top: monthShort, bottom: String(day) };
      order = 1;
    } else if (dayStart >= yesterdayStart) {
      key = 'yesterday';
      label = `Kemarin (${day} ${month} ${year})`;
      title = 'Kemarin';
      subtitle = fullDate;
      badge = { top: monthShort, bottom: String(day) };
      order = 2;
    } else if (dayStart >= sevenDaysStart) {
      key = 'last7';
      label = `7 Hari Terakhir (${month} ${year})`;
      title = '7 Hari Terakhir';
      subtitle = `${month} ${year}`;
      badge = { top: '7', bottom: 'HARI' };
      order = 3;
    } else if (dayStart >= thirtyDaysStart) {
      key = 'last30';
      label = `30 Hari Terakhir (${month} ${year})`;
      title = '30 Hari Terakhir';
      subtitle = `${month} ${year}`;
      badge = { top: '30', bottom: 'HARI' };
      order = 4;
    } else {
      key = `${validDate.getFullYear()}-${validDate.getMonth()}`;
      label = `${month} ${year}`;
      title = month;
      subtitle = String(year);
      badge = { top: String(year), bottom: monthShort };
      order = 1000 + (100000 - (validDate.getFullYear() * 12 + validDate.getMonth()));
    }

    if (!map.has(key)) {
      map.set(key, { label, title, subtitle, badge, order, items: [] });
    }
    map.get(key)!.items.push(conv);
  }

  return Array.from(map.values())
    .sort((a, b) => a.order - b.order)
    .map((g) => ({ label: g.label, title: g.title, subtitle: g.subtitle, badge: g.badge, items: g.items }));
}
