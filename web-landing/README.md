# SORAJA ENGINE — Web

Situs Astro statis untuk SORAJA ENGINE: halaman produk + **unduhan installer langsung**.

## Perintah

| Perintah | Fungsi |
| :-- | :-- |
| `pnpm dev:web` (dari root) | Dev server di `localhost:4321` |
| `pnpm build:web` (dari root) | Build ke `web-landing/dist/` |

## Menerbitkan installer ke halaman Unduh

Tombol Unduh membaca `src/data/releases.json` dan menautkan langsung ke aset **GitHub Releases** (tag `v<versi>`)
repo `origin` — installer tidak ikut di-commit. Berkas yang belum diterbitkan tampil sebagai **"Belum tersedia"**
(tidak ada pengalihan ke halaman lain). Push tag `v*` menjalankan `.github/workflows/release.yml` yang membangun
installer dan memperbarui manifest otomatis; langkah manual di bawah hanya bila membangun di mesin sendiri.

1. Build installer (versi diambil dari `crates/soraja-desktop/tauri.conf.json`):
   - Windows: `cargo tauri build` → `target/release/bundle/{msi,nsis}`
   - Linux (WSL/Linux): `cargo tauri build --bundles deb,appimage`
2. Terbitkan ke web (boleh per OS; entri lain di versi yang sama dipertahankan):
   ```sh
   pnpm publish:release -- --from target/release/bundle
   pnpm publish:release -- --from \\wsl.localhost\Ubuntu\home/<user>/soraja-target/release/bundle
   ```
   Skrip menyalin berkas ke `public/downloads/<versi>/soraja-engine_<versi>_<arch>.<ext>` (di-gitignore) dan menulis
   ukuran + SHA-256 + URL GitHub Releases ke `src/data/releases.json`.
3. Unggah berkas di `public/downloads/<versi>/` ke GitHub Release tag `v<versi>` (nama berkas harus sama).
4. Hapus `public/downloads/` agar installer tidak ikut ter-deploy, lalu `pnpm build:web` dan deploy isi `dist/`.
