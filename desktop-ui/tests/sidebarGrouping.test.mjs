/**
 * Sidebar & modal Riwayat: label waktu relatif (dihitung dari `updatedAt`) dan pengelompokan per tanggal.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupConversationsByDate, sortByActivity } from '../src/components/sidebar/conversationGrouping.ts';
import { fullDateTimeLabel, historyTimeLabel, relativeTimeLabel } from '../src/utils/relativeTime.ts';

/** Selasa, 20 Oktober 2026 14:30 waktu lokal. */
const NOW = new Date(2026, 9, 20, 14, 30).getTime();
const at = (...args) => new Date(...args).getTime();

test('relativeTimeLabel: menit, jam, hari kalender, minggu, lalu tanggal pendek', () => {
  assert.equal(relativeTimeLabel(NOW - 20_000, NOW), 'Baru saja');
  assert.equal(relativeTimeLabel(NOW - 5 * 60_000, NOW), '5 mnt');
  assert.equal(relativeTimeLabel(at(2026, 9, 20, 9, 0), NOW), '5 jam');
  assert.equal(relativeTimeLabel(at(2026, 9, 19, 23, 59), NOW), 'Kemarin');
  assert.equal(relativeTimeLabel(at(2026, 9, 17, 10, 0), NOW), '3 hari');
  assert.equal(relativeTimeLabel(at(2026, 9, 6, 10, 0), NOW), '2 mgg');
  assert.equal(relativeTimeLabel(at(2026, 8, 12, 10, 0), NOW), '12 Sep');
  assert.equal(relativeTimeLabel(at(2025, 8, 12, 10, 0), NOW), '12 Sep 2025');
  assert.equal(relativeTimeLabel(null, NOW), '');
});

test('relativeTimeLabel: lewat tengah malam tetap "Kemarin", bukan "2 mnt"', () => {
  const justAfterMidnight = at(2026, 9, 20, 0, 1);
  assert.equal(relativeTimeLabel(at(2026, 9, 19, 23, 59), justAfterMidnight), 'Kemarin');
});

test('historyTimeLabel & fullDateTimeLabel', () => {
  assert.equal(historyTimeLabel(at(2026, 9, 20, 9, 5), NOW), '09:05');
  assert.equal(historyTimeLabel(at(2026, 9, 19, 14, 32), NOW), '14:32');
  assert.equal(historyTimeLabel(at(2026, 9, 15, 8, 0), NOW), '15 Okt');
  assert.equal(fullDateTimeLabel(at(2026, 9, 19, 14, 32)), 'Senin, 19 Oktober 2026 · 14:32');
});

test('groupConversationsByDate: Hari Ini, Kemarin, 7 Hari Terakhir, Bulan & Tahun', () => {
  const iso = (...args) => new Date(...args).toISOString();
  const groups = groupConversationsByDate(
    [
      { id: 'c4', updatedAt: iso(2026, 9, 17, 10) },
      { id: 'c1', updatedAt: iso(2026, 9, 20, 9) },
      { id: 'c5', updatedAt: iso(2025, 8, 15) },
      { id: 'c3', updatedAt: iso(2026, 9, 19, 8) },
      { id: 'c2', updatedAt: iso(2026, 9, 20, 13) },
    ],
    NOW
  );
  assert.deepEqual(
    groups.map((g) => [g.label, g.items.map((c) => c.id)]),
    [
      ['Hari Ini', ['c2', 'c1']],
      ['Kemarin', ['c3']],
      ['7 Hari Terakhir', ['c4']],
      ['September 2025', ['c5']],
    ]
  );
  assert.deepEqual(groupConversationsByDate([], NOW), []);
  assert.deepEqual(groupConversationsByDate(null, NOW), []);
});

test('sortByActivity: terbaru di atas; tanggal tidak valid paling bawah', () => {
  const sorted = sortByActivity([
    { id: 'lama', updatedAt: '2026-10-01T00:00:00Z' },
    { id: 'rusak', updatedAt: 'bukan tanggal' },
    { id: 'baru', updatedAt: '2026-10-20T00:00:00Z' },
  ]);
  assert.deepEqual(sorted.map((c) => c.id), ['baru', 'lama', 'rusak']);
});
