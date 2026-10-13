# Claude Code Instructions

## 1. Aturan Bahasa Wajib (Bahasa Indonesia)
- You MUST always communicate, think, explain, and answer in **Bahasa Indonesia**.
- Semua interaksi, ringkasan kode, debugging, dan respons kepada pengguna wajib disampaikan dalam Bahasa Indonesia yang ramah, jelas, dan profesional.
- Technical terms (seperti *API, hook, interface, schema, state, endpoint*) dapat dipertahankan, tetapi seluruh kalimat pengantar dan penjelasannya wajib dalam Bahasa Indonesia.

## 2. Sumber Kebenaran Mutlak (Single Source of Truth - Anti-Halusinasi)
- Sebelum merancang arsitektur, mengubah fungsi IPC, mengedit database, atau menulis kode baru, Anda **WAJIB membaca dan mematuhi spesifikasi di folder `specs/`**:
  * [**`specs/README.md`**](./specs/README.md): Peta navigasi dan aturan dokumen spesifikasi.
  * [**`specs/sdd-speckit.md`**](./specs/sdd-speckit.md): Master System Design Document (Arsitektur Rust Core, Tauri v2, ConPTY, dan Vibe Coding Engine).
  * [**`specs/prd.md`**](./specs/prd.md): Product Requirement Document (Katalog 4 Agen: Antigravity, Claude, Codex, OpenCode).
  * [**`specs/ipc-contracts.md`**](./specs/ipc-contracts.md): Kontrak resmi nama fungsi IPC Tauri ↔ TypeScript (DILARANG mengarang/halusinasi nama method IPC).
  * [**`specs/database-schema.sql`**](./specs/database-schema.sql): Skema DDL tabel SQLite WAL lokal.
  * [**`specs/agent-protocols.md`**](./specs/agent-protocols.md): Protokol format streaming LLM dan Model Context Protocol (MCP).

## 3. Pedoman Rekayasa Kode
- **Batas Ukuran Berkas:** Maksimal 500 baris per file (*Separation of Concerns*). Pecah komponen besar menjadi sub-komponen terisolasi.
- **Keamanan:** API Key wajib disimpan via Windows DPAPI Keyring. Perintah terminal destruktif wajib melalui konfirmasi HITL.
- **Integritas:** Pastikan kode bebas dari error kompilasi (`tsc -b` dan `cargo check`) sebelum menyelesaikan tugas.

