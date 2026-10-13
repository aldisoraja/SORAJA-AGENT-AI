import test from 'node:test';
import assert from 'node:assert/strict';

// Helper fungsi simulasi pengurutan proyek (LRU + Pinning) seperti di db.ts & Sidebar.tsx
function sortProjects(list) {
  return [...list].sort((a, b) => {
    const pinA = a.isPinned ? 1 : 0;
    const pinB = b.isPinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
    return timeB - timeA;
  });
}

function touchProject(list, projectId) {
  const nowIso = new Date().toISOString();
  const updated = list.map((p) =>
    p.id === projectId ? { ...p, updatedAt: nowIso } : p
  );
  return sortProjects(updated);
}

function togglePin(list, projectId) {
  const nowIso = new Date().toISOString();
  const updated = list.map((p) =>
    p.id === projectId ? { ...p, isPinned: !p.isPinned, updatedAt: nowIso } : p
  );
  return sortProjects(updated);
}

function normalizePath(p) {
  if (!p) return '';
  return p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

test('Pin Project: Proyek yang di-pin otomatis berada di posisi teratas', () => {
  const now = Date.now();
  const projects = [
    { id: 'p1', name: 'Belajar Java Springboot', isPinned: false, updatedAt: new Date(now - 10000).toISOString() },
    { id: 'p2', name: 'Agent Soraja Ai', isPinned: false, updatedAt: new Date(now - 20000).toISOString() },
  ];

  // Pin Agent Soraja Ai
  const pinnedList = togglePin(projects, 'p2');
  assert.equal(pinnedList[0].id, 'p2', 'Proyek yang disematkan (Agent Soraja Ai) harus naik ke peringkat 1');
  assert.equal(pinnedList[0].isPinned, true);
  assert.equal(pinnedList[1].id, 'p1');
});

test('LRU Activity: Interaksi chat atau eksekusi CLI menaikkan repositori ke posisi teratas', () => {
  const now = Date.now();
  const projects = [
    { id: 'p1', name: 'Belajar Java Springboot', isPinned: false, updatedAt: new Date(now - 10000).toISOString() },
    { id: 'p2', name: 'Agent Soraja Ai', isPinned: false, updatedAt: new Date(now - 20000).toISOString() },
  ];

  // Awalnya p1 di atas karena updatedAt p1 lebih baru
  assert.equal(projects[0].id, 'p1');

  // Pengguna mulai chat atau mengeksekusi perintah terminal di p2 (Agent Soraja Ai)
  const afterTouch = touchProject(projects, 'p2');
  assert.equal(afterTouch[0].id, 'p2', 'Agent Soraja Ai harus langsung naik ke posisi teratas');
  assert.equal(afterTouch[1].id, 'p1');
});

test('LRU Activity dengan Proyek Pinned: Proyek pinned tetap prioritas di atas proyek non-pinned', () => {
  const now = Date.now();
  const projects = [
    { id: 'p1', name: 'Belajar Java Springboot', isPinned: true, updatedAt: new Date(now - 30000).toISOString() },
    { id: 'p2', name: 'Agent Soraja Ai', isPinned: false, updatedAt: new Date(now - 20000).toISOString() },
    { id: 'p3', name: 'E-Commerce React', isPinned: false, updatedAt: new Date(now - 40000).toISOString() },
  ];

  // Interaksi di p3
  const afterTouch = touchProject(projects, 'p3');
  // p1 tetap di posisi 0 karena isPinned: true
  assert.equal(afterTouch[0].id, 'p1', 'Proyek yang di-pin tetap berada di puncak');
  // Di antara yang non-pinned, p3 yang baru saja disentuh berada di atas p2
  assert.equal(afterTouch[1].id, 'p3');
  assert.equal(afterTouch[2].id, 'p2');
});

test('Terminal Path Normalization: Mengabaikan perbedaan backslash Windows vs forward slash', () => {
  const winPath = 'D:\\Berkas Kerja Aldi Soraja\\Belajar Java Springboot\\';
  const posixPath = 'd:/berkas kerja aldi soraja/belajar java springboot';

  assert.equal(normalizePath(winPath), normalizePath(posixPath));
});
