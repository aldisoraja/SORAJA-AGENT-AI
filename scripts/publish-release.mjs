#!/usr/bin/env node
/**
 * publish-release.mjs — menerbitkan installer hasil `tauri build` ke web Soraja Engine.
 *
 * Menyalin berkas bundle (.msi, -setup.exe, .deb, .AppImage, .rpm, .dmg) dari satu atau beberapa folder
 * `target/release/bundle` ke `web-landing/public/downloads/<versi>/` dengan nama tanpa spasi, lalu
 * menulis manifest `web-landing/src/data/releases.json` (ukuran + SHA-256) yang dibaca halaman Unduh.
 * Entri lain di versi yang sama dipertahankan, jadi Windows & Linux boleh diterbitkan terpisah.
 *
 * Pemakaian:
 *   node scripts/publish-release.mjs [--from <folder bundle>]...
 *   (default: target/release/bundle)
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauriConf = JSON.parse(fs.readFileSync(path.join(root, 'crates/soraja-desktop/tauri.conf.json'), 'utf8'));
const version = tauriConf.version;
const webDir = path.join(root, 'web-landing');
const outDir = path.join(webDir, 'public', 'downloads', version);
const manifestPath = path.join(webDir, 'src', 'data', 'releases.json');

/** Jenis bundle Tauri → metadata tampilan di web. */
const KINDS = [
  { test: /\.msi$/i, id: 'windows-msi', os: 'windows', label: 'Installer .msi', ext: 'msi' },
  { test: /-setup\.exe$/i, id: 'windows-exe', os: 'windows', label: 'Installer .exe', ext: 'setup.exe' },
  { test: /\.deb$/i, id: 'linux-deb', os: 'linux', label: 'Paket .deb', ext: 'deb' },
  { test: /\.rpm$/i, id: 'linux-rpm', os: 'linux', label: 'Paket .rpm', ext: 'rpm' },
  { test: /\.AppImage$/i, id: 'linux-appimage', os: 'linux', label: 'AppImage', ext: 'AppImage' },
  { test: /\.dmg$/i, id: 'macos-dmg', os: 'macos', label: 'Disk image .dmg', ext: 'dmg' },
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function archOf(name) {
  if (/(aarch64|arm64)/i.test(name)) return 'arm64';
  if (/(x64|x86_64|amd64)/i.test(name)) return 'x64';
  return 'x64';
}

const fromDirs = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--from' && process.argv[i + 1]) fromDirs.push(path.resolve(process.argv[++i]));
}
if (fromDirs.length === 0) fromDirs.push(path.join(root, 'target', 'release', 'bundle'));

const found = fromDirs.flatMap(walk).flatMap((file) => {
  const kind = KINDS.find((k) => k.test.test(path.basename(file)));
  return kind && path.basename(file).includes(version) ? [{ file, kind }] : [];
});
if (found.length === 0) {
  console.error(`Tidak ada bundle versi ${version} di: ${fromDirs.join(', ')}`);
  console.error('Jalankan `cargo tauri build` lebih dulu.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const prev = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
const entries = new Map((prev?.version === version ? prev.files : []).map((f) => [f.id, f]));

for (const { file, kind } of found) {
  const arch = archOf(path.basename(file));
  const id = `${kind.id}-${arch}`;
  const target = `soraja-engine_${version}_${arch}.${kind.ext}`;
  fs.copyFileSync(file, path.join(outDir, target));
  const data = fs.readFileSync(file);
  entries.set(id, {
    id,
    os: kind.os,
    arch,
    label: kind.label,
    file: target,
    url: `/downloads/${version}/${encodeURIComponent(target)}`,
    sizeBytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  });
  console.log(`✓ ${kind.label} (${arch}) → public/downloads/${version}/${target}`);
}

const manifest = {
  version,
  releasedAt: new Date().toISOString().slice(0, 10),
  files: [...entries.values()].sort((a, b) => a.id.localeCompare(b.id)),
};
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifest ditulis: web-landing/src/data/releases.json (${manifest.files.length} berkas, v${version})`);
