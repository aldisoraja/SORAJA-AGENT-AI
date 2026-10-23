/**
 * appUpdater.ts
 * Pembaruan otomatis aplikasi desktop: `check_app_update` / `install_app_update` + event `app:update_progress`
 * (specs/ipc-contracts.md bagian 8). State disimpan di satu store modul agar banner dan tab Pengaturan
 * melihat status yang sama. Di browser (Vite dev) updater tidak tersedia dan status tetap `unsupported`.
 */
import { useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauriRuntime } from './headlessTransport';

export interface AppUpdateInfo {
  version: string;
  currentVersion: string;
  notes: string | null;
}

export type AppUpdateStatus =
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate'; checkedAt: number }
  | { kind: 'available'; info: AppUpdateInfo }
  | { kind: 'installing'; info: AppUpdateInfo; downloaded: number; total: number | null }
  | { kind: 'error'; message: string; info: AppUpdateInfo | null };

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string | null;
  /** Versi yang banner-nya ditutup pengguna ("Nanti"); tetap bisa dipasang dari Pengaturan. */
  dismissedVersion: string | null;
}

/** Pemeriksaan pertama ditunda agar tidak berebut jaringan/CPU dengan startup agen. */
const FIRST_CHECK_DELAY_MS = 8_000;
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let state: AppUpdateState = {
  status: isTauriRuntime ? { kind: 'idle' } : { kind: 'unsupported' },
  currentVersion: null,
  dismissedVersion: null,
};
const listeners = new Set<() => void>();

function setState(patch: Partial<AppUpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppUpdate(): AppUpdateState {
  return useSyncExternalStore(subscribe, () => state);
}

function errorMessage(e: unknown): string {
  return typeof e === 'string' ? e : e instanceof Error ? e.message : 'Terjadi kesalahan tak dikenal.';
}

/** Memeriksa versi terbaru di GitHub Release. Tidak melakukan apa-apa saat sedang memeriksa/memasang. */
export async function checkForAppUpdate(): Promise<void> {
  const busy = state.status.kind === 'checking' || state.status.kind === 'installing';
  if (!isTauriRuntime || busy) return;
  setState({ status: { kind: 'checking' } });
  try {
    const info = await invoke<AppUpdateInfo | null>('check_app_update');
    setState({ status: info ? { kind: 'available', info } : { kind: 'upToDate', checkedAt: Date.now() } });
  } catch (e) {
    setState({ status: { kind: 'error', message: errorMessage(e), info: null } });
  }
}

/** Mengunduh & memasang versi yang ditemukan; aplikasi lalu ditutup dan dibuka ulang oleh installer/updater. */
export async function installAppUpdate(): Promise<void> {
  const current = state.status;
  const info = current.kind === 'available' ? current.info : current.kind === 'error' ? current.info : null;
  if (!info) return;
  setState({ status: { kind: 'installing', info, downloaded: 0, total: null } });
  const unlisten = await listen<{ downloaded: number; total: number | null }>('app:update_progress', ({ payload }) => {
    if (state.status.kind === 'installing') setState({ status: { ...state.status, ...payload } });
  });
  try {
    await invoke('install_app_update');
  } catch (e) {
    setState({ status: { kind: 'error', message: errorMessage(e), info } });
  } finally {
    unlisten();
  }
}

/** Teks progres unduhan, mis. "Mengunduh 12,4 / 38,0 MB (33%)". */
export function describeInstallProgress(downloaded: number, total: number | null): string {
  const mb = (n: number) => (n / 1024 / 1024).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (!total) return `Mengunduh ${mb(downloaded)} MB…`;
  if (downloaded >= total) return 'Memasang pembaruan… aplikasi akan dibuka ulang.';
  return `Mengunduh ${mb(downloaded)} / ${mb(total)} MB (${Math.floor((downloaded / total) * 100)}%)`;
}

export function dismissAppUpdate(version: string) {
  setState({ dismissedVersion: version });
}

let autoCheckStarted = false;

/** Dipanggil sekali saat aplikasi dibuka: membaca versi terpasang lalu memeriksa pembaruan berkala. */
export function startAppUpdateAutoCheck() {
  if (!isTauriRuntime || autoCheckStarted) return;
  autoCheckStarted = true;
  import('@tauri-apps/api/app')
    .then(({ getVersion }) => getVersion())
    .then((currentVersion) => setState({ currentVersion }))
    .catch(() => {});
  setTimeout(() => void checkForAppUpdate(), FIRST_CHECK_DELAY_MS);
  setInterval(() => {
    if (state.status.kind !== 'available') void checkForAppUpdate();
  }, RECHECK_INTERVAL_MS);
}
