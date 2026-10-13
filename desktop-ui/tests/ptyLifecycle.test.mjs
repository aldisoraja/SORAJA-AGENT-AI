import test from 'node:test';
import assert from 'node:assert/strict';
import { hasSpawned, ptyRelease, ptyRetain, ptySpawn } from '../src/components/terminal/ptyTransport.ts';

// Simulasi React StrictMode: mount → cleanup → mount ulang secara sinkron untuk sessionId yang sama.
const req = (sessionId) => ({ sessionId, agentExecutable: 'claude', agentArgs: [], cwd: '', cols: 80, rows: 24, envs: {} });

test('spawn idempoten: dua kali spawn sesi yang sama memakai promise yang sama', async () => {
  const a = ptySpawn(req('s-dup'));
  const b = ptySpawn(req('s-dup'));
  assert.equal(a, b);
  assert.equal(await a, 'none'); // di Node tidak ada Tauri maupun Vite HMR
});

test('StrictMode: release lalu retain segera membatalkan close (sesi tetap hidup)', async () => {
  ptySpawn(req('s-strict'));
  ptyRelease('s-strict'); // cleanup effect pertama
  ptyRetain('s-strict'); // mount ulang
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(hasSpawned('s-strict'), true, 'sesi tidak boleh ditutup');
});

test('unmount sungguhan: release tanpa retain menutup sesi setelah jeda', async () => {
  ptySpawn(req('s-close'));
  ptyRelease('s-close');
  assert.equal(hasSpawned('s-close'), true, 'belum ditutup sebelum jeda habis');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(hasSpawned('s-close'), false);
});
