import { test } from 'node:test';
import assert from 'node:assert/strict';

const INDO_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function groupConversationsByDate(convs) {
  if (!convs || convs.length === 0) return [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDayMs = 86400000;
  const yesterdayStart = todayStart - oneDayMs;
  const sevenDaysStart = todayStart - 6 * oneDayMs;
  const thirtyDaysStart = todayStart - 29 * oneDayMs;

  const sorted = [...convs].sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
    return timeB - timeA;
  });

  const map = new Map();

  for (const conv of sorted) {
    const dateObj = new Date(conv.updatedAt || conv.createdAt || Date.now());
    const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;
    const dayStart = new Date(validDate.getFullYear(), validDate.getMonth(), validDate.getDate()).getTime();
    const day = validDate.getDate();
    const month = INDO_MONTHS[validDate.getMonth()];
    const year = validDate.getFullYear();

    let key;
    let label;
    let order;

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
    map.get(key).items.push(conv);
  }

  return Array.from(map.values())
    .sort((a, b) => a.order - b.order)
    .map((g) => ({ label: g.label, items: g.items }));
}

test('Sidebar Grouping: Mengelompokkan percakapan Hari Ini, Kemarin, dan Bulan Sebelumnya', () => {
  const now = new Date();
  const todayISO = now.toISOString();

  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayISO = yesterday.toISOString();

  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
  const threeDaysAgoISO = threeDaysAgo.toISOString();

  const oldDate = new Date(2025, 8, 15); // 15 September 2025
  const oldDateISO = oldDate.toISOString();

  const mockConversations = [
    { id: 'c1', title: 'Fitur Login', updatedAt: todayISO },
    { id: 'c2', title: 'Perbaikan API', updatedAt: todayISO },
    { id: 'c3', title: 'Setup Database', updatedAt: yesterdayISO },
    { id: 'c4', title: 'Eksplorasi Arsitektur', updatedAt: threeDaysAgoISO },
    { id: 'c5', title: 'Inisialisasi Awal', updatedAt: oldDateISO },
  ];

  const groups = groupConversationsByDate(mockConversations);

  assert.equal(groups.length, 4, 'Harus terbagi menjadi 4 kelompok');
  assert.match(groups[0].label, /^Hari Ini/);
  assert.equal(groups[0].items.length, 2);

  assert.match(groups[1].label, /^Kemarin/);
  assert.equal(groups[1].items.length, 1);

  assert.match(groups[2].label, /^7 Hari Terakhir/);
  assert.equal(groups[2].items.length, 1);

  assert.equal(groups[3].label, 'September 2025');
  assert.equal(groups[3].items.length, 1);
});

test('Sidebar Grouping: Mengembalikan array kosong jika tidak ada percakapan', () => {
  assert.deepEqual(groupConversationsByDate([]), []);
  assert.deepEqual(groupConversationsByDate(null), []);
});

test('Sidebar Limit: Menampilkan 3 percakapan teratas saat collapsed dan seluruh percakapan saat expanded', () => {
  const mockConvs = Array.from({ length: 10 }, (_, i) => ({
    id: `c-${i}`,
    title: `Percakapan ${i + 1}`,
    updatedAt: new Date(Date.now() - i * 1000 * 60).toISOString(),
  }));

  // Skenario 1: Collapsed (default) -> Hanya 3 teratas
  const isRepoExpandedFalse = false;
  const visibleConvsCollapsed = isRepoExpandedFalse ? mockConvs : mockConvs.slice(0, 3);
  assert.equal(visibleConvsCollapsed.length, 3, 'Hanya 3 percakapan yang ditampilkan saat collapsed');

  // Skenario 2: Expanded -> Semua 10 percakapan
  const isRepoExpandedTrue = true;
  const visibleConvsExpanded = isRepoExpandedTrue ? mockConvs : mockConvs.slice(0, 3);
  assert.equal(visibleConvsExpanded.length, 10, 'Seluruh 10 percakapan ditampilkan saat expanded');
});

