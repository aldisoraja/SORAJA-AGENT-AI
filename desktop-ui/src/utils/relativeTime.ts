/**
 * relativeTime.ts
 * Label waktu percakapan yang dihitung saat render dari `updatedAt` (bukan teks tersimpan yang basi).
 * Diuji di `tests/sidebarGrouping.test.mjs`.
 */
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAY_MS = 86_400_000;

/** Waktu aktivitas terakhir percakapan (ms); `null` bila tanggal tidak valid. */
export function activityTime(item: { updatedAt?: string; createdAt?: string }): number | null {
  const t = new Date(item.updatedAt || item.createdAt || '').getTime();
  return Number.isNaN(t) ? null : t;
}

const dayStart = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Selisih hari kalender (bukan 24 jam): kemarin 23.59 tetap "Kemarin" walau baru 2 menit berlalu. */
function calendarDaysAgo(t: number, now: number): number {
  return Math.round((dayStart(now) - dayStart(t)) / DAY_MS);
}

const two = (n: number) => String(n).padStart(2, '0');
const clock = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;

/** Label ringkas untuk sidebar: "Baru saja", "5 mnt", "2 jam", "Kemarin", "3 hari", "2 mgg", "12 Sep", "12 Sep 2025". */
export function relativeTimeLabel(t: number | null, now: number): string {
  if (t == null) return '';
  const diff = Math.max(0, now - t);
  const days = calendarDaysAgo(t, now);
  if (days <= 0) {
    if (diff < 60_000) return 'Baru saja';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} mnt`;
    return `${Math.floor(diff / 3_600_000)} jam`;
  }
  if (days === 1) return 'Kemarin';
  if (days < 7) return `${days} hari`;
  if (days < 30) return `${Math.floor(days / 7)} mgg`;
  const d = new Date(t);
  const short = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? short : `${short} ${d.getFullYear()}`;
}

/** Label di modal Riwayat (header grup sudah menyebut harinya): jam untuk hari ini & kemarin, selain itu tanggal pendek. */
export function historyTimeLabel(t: number | null, now: number): string {
  if (t == null) return '';
  const d = new Date(t);
  if (calendarDaysAgo(t, now) <= 1) return clock(d);
  const short = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? short : `${short} ${d.getFullYear()}`;
}

/** Tooltip lengkap, mis. "Senin, 19 Oktober 2026 · 14:32". */
export function fullDateTimeLabel(t: number | null): string {
  if (t == null) return '';
  const d = new Date(t);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${clock(d)}`;
}

export { MONTHS as INDO_MONTHS };
