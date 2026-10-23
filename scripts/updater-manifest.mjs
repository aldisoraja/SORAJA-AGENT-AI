#!/usr/bin/env node
/**
 * updater-manifest.mjs — menulis `latest.json` untuk pembaruan otomatis di aplikasi (tauri-plugin-updater).
 *
 * Dibuat sekali di job `manifest` (release.yml) setelah semua build selesai, dari pasangan berkas
 * `<bundle>` + `<bundle>.sig` hasil `createUpdaterArtifacts` yang sudah diunduh dari GitHub Release.
 * Sengaja tidak memakai `includeUpdaterJson` tauri-action: empat runner paralel yang masing-masing
 * menggabungkan `latest.json` bisa saling menimpa sehingga sebagian OS hilang dari manifest.
 * Catatan rilis diambil dari bagian "### 📌 Rilis v<versi>" di README.md (bila ada).
 *
 * Pemakaian:
 *   node scripts/updater-manifest.mjs --from <folder aset Release> [--out <berkas>]
 *   (default --out: <folder aset>/latest.json)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'crates/soraja-desktop/tauri.conf.json'), 'utf8')).version;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const fromDir = arg('--from') && path.resolve(arg('--from'));
if (!fromDir || !fs.existsSync(fromDir)) {
  console.error('Pemakaian: node scripts/updater-manifest.mjs --from <folder aset Release> [--out <berkas>]');
  process.exit(1);
}
const outFile = path.resolve(arg('--out') ?? path.join(fromDir, 'latest.json'));

function releaseBase() {
  if (process.env.SORAJA_RELEASE_BASE) return process.env.SORAJA_RELEASE_BASE.replace(/\/$/, '');
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim();
  const m = /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(remote);
  if (!m) throw new Error(`Remote origin bukan GitHub: ${remote}. Set SORAJA_RELEASE_BASE.`);
  return `https://github.com/${m[1]}/releases/download/v${version}`;
}

/** Jenis bundle updater → OS & nama installer di kunci platform (`<os>-<arch>-<installer>`). */
const KINDS = [
  { test: /-setup\.exe$/i, os: 'windows', installer: 'nsis' },
  { test: /\.msi$/i, os: 'windows', installer: 'msi' },
  { test: /\.app\.tar\.gz$/i, os: 'darwin', installer: 'app' },
  { test: /\.AppImage$/i, os: 'linux', installer: 'appimage' },
  { test: /\.deb$/i, os: 'linux', installer: 'deb' },
  { test: /\.rpm$/i, os: 'linux', installer: 'rpm' },
];
/** Installer untuk kunci umum `<os>-<arch>` (dipakai updater bila jenis installer tidak dikenali). */
const DEFAULT_INSTALLER = { windows: 'nsis', darwin: 'app', linux: 'appimage' };

const archOf = (name) => (/(aarch64|arm64)/i.test(name) ? 'aarch64' : 'x86_64');

function releaseNotes() {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const start = readme.search(new RegExp(`^### .*Rilis v${version.replace(/\./g, '\\.')}\\b`, 'm'));
  if (start < 0) return `Soraja Engine v${version}`;
  const body = readme.slice(readme.indexOf('\n', start) + 1);
  const end = body.search(/^(### |## |---)/m);
  return (end < 0 ? body : body.slice(0, end))
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

const base = releaseBase();
const platforms = {};
for (const sigName of fs.readdirSync(fromDir).filter((n) => n.endsWith('.sig'))) {
  const bundle = sigName.slice(0, -'.sig'.length);
  const kind = KINDS.find((k) => k.test.test(bundle));
  if (!kind || !fs.existsSync(path.join(fromDir, bundle))) continue;
  const entry = {
    signature: fs.readFileSync(path.join(fromDir, sigName), 'utf8').trim(),
    url: `${base}/${encodeURIComponent(bundle)}`,
  };
  const target = `${kind.os}-${archOf(bundle)}`;
  platforms[`${target}-${kind.installer}`] = entry;
  if (DEFAULT_INSTALLER[kind.os] === kind.installer) platforms[target] = entry;
  console.log(`✓ ${target}-${kind.installer} ← ${bundle}`);
}

if (Object.keys(platforms).length === 0) {
  console.error(`Tidak ada pasangan bundle + .sig di ${fromDir}. Pastikan TAURI_SIGNING_PRIVATE_KEY terpasang di CI.`);
  process.exit(1);
}

const manifest = { version, notes: releaseNotes(), pub_date: new Date().toISOString(), platforms };
fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`latest.json ditulis: ${outFile} (${Object.keys(platforms).length} kunci platform, v${version})`);
