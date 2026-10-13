# SORAJA ENGINE — Web

Situs Astro statis untuk SORAJA ENGINE: halaman produk + **unduhan installer langsung**.

## Perintah

| Perintah | Fungsi |
| :-- | :-- |
| `pnpm dev:web` (dari root) | Dev server di `localhost:4321` |
| `pnpm build:web` (dari root) | Build ke `web-landing/dist/` |

## Menerbitkan installer ke halaman Unduh

Tombol Unduh membaca `src/data/releases.json` dan menautkan langsung ke berkas di `public/downloads/<versi>/`.
Berkas yang belum diterbitkan tampil sebagai **"Belum tersedia"** (tidak ada pengalihan ke halaman lain).

1. Build installer (versi diambil dari `crates/soraja-desktop/tauri.conf.json`):
   - Windows: `cargo tauri build` → `target/release/bundle/{msi,nsis}`
   - Linux (WSL/Linux): `cargo tauri build --bundles deb,appimage`
2. Terbitkan ke web (boleh per OS; entri lain di versi yang sama dipertahankan):
   ```sh
   pnpm publish:release -- --from target/release/bundle
   pnpm publish:release -- --from \\wsl.localhost\Ubuntu\home/<user>/soraja-target/release/bundle
   ```
   Skrip menyalin berkas ke `public/downloads/<versi>/soraja-engine_<versi>_<arch>.<ext>` dan menulis ukuran + SHA-256
   ke `src/data/releases.json`.
3. `pnpm build:web` lalu deploy isi `dist/` (installer ikut di `dist/downloads/`).
