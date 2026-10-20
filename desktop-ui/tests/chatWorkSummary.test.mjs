/**
 * Helper tampilan Chat GUI (panel "Proses kerja", kartu perubahan, panel review) dan parser diff git.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityLabel,
  diffBlocks,
  diffForStep,
  diffPreview,
  groupSteps,
  groupSummary,
  splitPath,
  summaryParts,
  countSteps,
  mergeFileEdits,
  usageHeadline,
} from '../src/components/chat/work/workSummary.ts';
import { applyFileChange } from '../src/services/cli/trajectoryBuilder.ts';
import { absoluteInProject, isNewFileStatus, parseUnifiedDiff, relativeToProject, wholeFileAdded } from '../src/services/cli/fileChangeDiff.ts';

/** Keluaran nyata `git diff --no-color` (2 hunk, karakter non-ASCII, baris kosong ditambahkan). */
const GIT_DIFF = [
  'diff --git a/g.txt b/g.txt',
  'index 053e141..6b60642 100644',
  '--- a/g.txt',
  '+++ b/g.txt',
  '@@ -1,6 +1,6 @@',
  ' baris 1',
  ' baris 2',
  '-baris 3',
  '+baris 3 — ubah ✓',
  ' baris 4',
  ' baris 5',
  ' baris 6',
  '@@ -22,8 +22,9 @@ baris 21',
  ' baris 22',
  ' baris 23',
  ' baris 24',
  '-baris 25',
  '+',
  ' baris 26',
  '+sisipan',
  ' baris 27',
  ' baris 28',
  ' baris 29',
].join('\r\n');

test('parseUnifiedDiff: statistik, nomor baris, dan jumlah baris tersembunyi antar-hunk akurat', () => {
  const d = parseUnifiedDiff(GIT_DIFF, 'D:/p/g.txt', 'g.txt');
  assert.equal(d.additions, 3);
  assert.equal(d.deletions, 2);
  const changed = d.diffLines.filter((l) => l.type === 'added');
  assert.deepEqual(changed.map((l) => [l.newLineNo, l.text]), [[3, 'baris 3 — ubah ✓'], [25, ''], [27, 'sisipan']]);
  assert.deepEqual(d.diffLines.filter((l) => l.type === 'deleted').map((l) => l.oldLineNo), [3, 25]);
  const collapsed = d.diffLines.filter((l) => l.type === 'collapsed');
  assert.deepEqual(collapsed.map((l) => l.collapsedCount), [15], 'baris 7–21 tidak berubah');
  assert.equal(d.diffLines[0].type, 'context', 'hunk mulai di baris 1 → tidak ada pemisah di awal');
  assert.equal(parseUnifiedDiff('', 'a', 'a'), null, 'diff kosong = tidak ada perubahan');
});

test('isNewFileStatus: hanya berkas tanpa versi git yang ditampilkan utuh sebagai baru', () => {
  assert.equal(isNewFileStatus('?? new.txt'), true);
  assert.equal(isNewFileStatus('!! dist/x.js'), true);
  assert.equal(isNewFileStatus('A  src/b.ts'), true);
  assert.equal(isNewFileStatus(''), false, 'ter-track & tidak berubah → bukan berkas baru');
  assert.equal(isNewFileStatus('M src/a.ts'), false);
  assert.equal(isNewFileStatus(' M src/a.ts'), false);
});

test('absoluteInProject: path relatif CLI dibaca dari folder proyek', () => {
  assert.equal(absoluteInProject('src/a.ts', 'D:\\Proj\\'), 'D:\\Proj\\src\\a.ts');
  assert.equal(absoluteInProject('./b.ts', 'D:/Proj'), 'D:/Proj/b.ts');
  assert.equal(absoluteInProject('C:\\x\\a.ts', 'D:\\Proj'), 'C:\\x\\a.ts');
  assert.equal(absoluteInProject('/home/u/a.ts', '/home/u'), '/home/u/a.ts');
});

test('wholeFileAdded & relativeToProject', () => {
  const d = wholeFileAdded('a\r\nb\r\n', 'D:\\Proj\\src\\x.ts', 'src/x.ts');
  assert.equal(d.additions, 2);
  assert.deepEqual(d.diffLines.map((l) => l.text), ['a', 'b']);
  assert.equal(relativeToProject('D:\\Proj\\src\\x.ts', 'd:/proj/'), 'src/x.ts');
  assert.equal(relativeToProject('E:/lain/x.ts', 'D:/Proj'), 'E:/lain/x.ts');
});

test('groupSteps: ≥2 baca/cari berurutan diringkas (termasuk yang berjalan); jenis lain memutus grup', () => {
  const r = (label, status = 'done') => ({ type: 'analyzed', label, status });
  const s = { type: 'explored', label: '"x"', status: 'done' };
  const cmd = { type: 'command', label: 'npm test', status: 'done', toolId: 'c' };
  const items = groupSteps([r('a.ts'), r('b.ts'), s, cmd, r('c.ts'), r('d.ts'), r('e.ts', 'running')]);
  assert.deepEqual(items.map((i) => i.kind), ['group', 'step', 'group']);
  assert.equal(items[0].steps.length, 3);
  assert.equal(groupSummary(items[0].steps), '2 berkas dibaca · 1 pencarian');
  // Langkah baru yang berjalan tidak memecah grup lama menjadi baris lepas (kunci grup tetap).
  const before = groupSteps([r('a.ts'), r('b.ts'), r('c.ts')]);
  const after = groupSteps([r('a.ts'), r('b.ts'), r('c.ts'), r('d.ts', 'running')]);
  assert.equal(after.length, 1);
  assert.equal(after[0].key, before[0].key);
  assert.equal(new Set(items.map((i) => i.key)).size, items.length, 'key React unik');
  assert.equal(groupSummary([r('a.ts'), r('A.ts'), r('b.ts')]), '2 berkas dibaca', 'berkas yang sama dibaca ulang dihitung sekali');
});

test('diffBlocks: proporsional, sisi kecil tetap terlihat, total selalu 5', () => {
  assert.deepEqual(diffBlocks(0, 0), ['none', 'none', 'none', 'none', 'none']);
  assert.deepEqual(diffBlocks(1, 0), ['add', 'none', 'none', 'none', 'none']);
  for (const [a, d] of [[100, 1], [1, 100], [50, 50], [3, 0], [0, 7], [1000, 999]]) {
    const b = diffBlocks(a, d);
    assert.equal(b.length, 5);
    if (a > 0) assert.ok(b.includes('add'), `${a}/${d} menampilkan tambah`);
    if (d > 0) assert.ok(b.includes('del'), `${a}/${d} menampilkan hapus`);
  }
});

test('diffPreview: hanya baris berubah + konteks, tanpa pemisah, jumlah sisa akurat', () => {
  const d = parseUnifiedDiff(GIT_DIFF, 'g.txt', 'g.txt');
  const full = diffPreview(d, 50);
  assert.equal(full.hidden, 0);
  assert.ok(full.lines.every((l) => l.type !== 'collapsed'));
  assert.equal(full.lines.filter((l) => l.type === 'added' || l.type === 'deleted').length, 5);
  const cut = diffPreview(d, 4);
  assert.equal(cut.lines.length, 4);
  assert.equal(cut.hidden, 5 - cut.lines.filter((l) => l.type === 'added' || l.type === 'deleted').length);
});

test('diffForStep: diff dicari dari codeEdits per path (beda pemisah/huruf), fallback diff lama', () => {
  const chunk = { file: 'D:\\P\\src\\a.ts', relativePath: 'src/a.ts', additions: 1, deletions: 0, diffLines: [] };
  assert.equal(diffForStep({ type: 'edited', label: 'a.ts', file: 'd:/p/src/a.ts' }, [chunk]), chunk);
  assert.equal(diffForStep({ type: 'edited', label: 'a.ts', file: 'src/a.ts' }, [chunk]), chunk, 'path relatif dari CLI');
  const legacy = { ...chunk, file: 'x' };
  assert.equal(diffForStep({ type: 'edited', label: 'x', diff: legacy }, []), legacy);
});

test('activityLabel & summaryParts: kalimat status berbahasa Indonesia', () => {
  assert.equal(activityLabel([], false), 'Memulai agen…');
  assert.equal(activityLabel([{ type: 'command', label: 'x', status: 'done' }], false), 'Melanjutkan…');
  assert.equal(activityLabel([{ type: 'plan', label: 'p', status: 'running' }], false), 'Menyusun rencana kerja…');
  assert.equal(activityLabel([{ type: 'analyzed', label: 'D:\\p\\App.tsx', status: 'running' }], false), 'Membaca App.tsx…');
  const c = countSteps([
    { type: 'analyzed', label: 'a', status: 'done' },
    { type: 'web', label: 'u', status: 'done' },
    { type: 'command', label: 'c', status: 'denied' },
  ]);
  assert.deepEqual(summaryParts(c), ['1 berkas dibaca', '1 akses web', '1 perintah']);
  assert.equal(c.denied, 1);
});

test('splitPath: folder & nama berkas', () => {
  assert.deepEqual(splitPath('src\\components\\App.tsx'), { dir: 'src/components/', name: 'App.tsx' });
  assert.deepEqual(splitPath('README.md'), { dir: '', name: 'README.md' });
});

test('mergeFileEdits: edit berulang berkas sama jadi satu baris (posisi terakhir); gagal/ditolak tetap terpisah', () => {
  const e = (id, file, status = 'done') => ({ type: 'edited', label: 'App.tsx', file, toolId: id, status });
  const read = { type: 'analyzed', label: 'x', file: 'x.ts', status: 'done' };
  const merged = mergeFileEdits([e('t1', 'D:\\p\\src\\App.tsx'), read, e('t2', 'd:/p/src/App.tsx'), e('t3', 'D:\\p\\b.ts'), e('t4', 'D:\\p\\src\\App.tsx', 'error')]);
  assert.deepEqual(merged.map((s) => s.toolId ?? s.type), ['analyzed', 't2', 't3', 't4']);
  assert.equal(merged[1].count, 2);
  assert.equal(merged[2].count, undefined);
  const keys = groupSteps(merged).map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length, 'kunci unik');
  assert.equal(groupSteps(mergeFileEdits([e('t1', 'a.ts')]))[0].key, groupSteps(mergeFileEdits([e('t1', 'a.ts'), e('t9', 'a.ts')]))[0].key, 'kunci stabil saat edit baru masuk');
});

test('applyFileChange: tool edit tanpa path (OpenCode patch) diisi berkasnya, bukan ditambah baris kembar', () => {
  const steps = applyFileChange([{ type: 'edited', label: 'patch', toolId: 'p1', status: 'done' }], 'src/a.ts', 5);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].file, 'src/a.ts');
  assert.equal(steps[0].label, 'a.ts');
  assert.equal(applyFileChange(steps, 'src/b.ts', 6).length, 2, 'berkas kedua patch → baris baru');
});

test('usageHeadline: total token masuk + keluar, kredit untuk Kiro, kosong bila tidak dilaporkan', () => {
  const tokens = usageHeadline({ inputTokens: 23857, outputTokens: 1858, costUsd: 0.10918 });
  assert.equal(tokens.text, '25,7 rb token');
  assert.ok(tokens.title.includes('23.857 token masuk'));
  assert.ok(tokens.title.includes('1.858 token keluar'));
  assert.ok(tokens.title.includes('$0.1092'));
  assert.ok(!tokens.title.includes('cache'), 'tanpa baca cache → tidak disebut');
  const cached = usageHeadline({ inputTokens: 77721, outputTokens: 26490, cacheReadTokens: 2766744 });
  assert.equal(cached.text, '104,2 rb token', 'baca cache tidak ikut total');
  assert.ok(cached.title.includes('2,8 jt token dibaca ulang dari cache'));
  assert.equal(usageHeadline({ inputTokens: 0, outputTokens: 0, credits: 0.15 }).text, '0,15 kredit');
  assert.equal(usageHeadline({ inputTokens: 0, outputTokens: 0 }), undefined);
  assert.equal(usageHeadline(undefined), undefined);
});
