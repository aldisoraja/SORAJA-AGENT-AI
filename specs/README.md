# 📚 SpecKit: Indeks & Spesifikasi Arsitektur Agent Soraja AI

> **Single Source of Truth (SSOT)** untuk seluruh asisten AI dan pengembang dalam merancang, memodifikasi, dan memelihara aplikasi Agent Soraja AI (Desktop Command Center, Multi-Tab Terminal CLI, dan Web Portal).

---

## 🧭 Peta Navigasi Dokumen Spesifikasi

Folder `specs/` ini dikelola menggunakan pola arsitektur **Spec-Driven Development (SDD)** modular. Setiap berkas memiliki batas tanggung jawab (*Separation of Concerns*) yang tegas:

| No | Berkas Spesifikasi | Domain & Peran Utama | Kapan AI / Developer Wajib Membaca? |
| :-: | :--- | :--- | :--- |
| **1** | [**`sdd-speckit.md`**](./sdd-speckit.md) | **Master System Design Document (SDD)**<br>Arsitektur hybrid: 5 CLI agen native (agy, claude, codex, opencode, kiro-cli) dalam mode Chat GUI (headless stream-json) & Terminal (ConPTY). **§11 adalah acuan utama.** | Saat merancang fitur baru, refactor arsitektur, mengubah pola thread/concurrency, atau mengintegrasikan background agent. |
| **2** | [**`prd.md`**](./prd.md) | **Product Requirement Document (PRD)**<br>Visi produk, katalog 5 agen CLI (Antigravity, Claude, Codex, OpenCode, Kiro), 2 mode (Chat GUI & Terminal CLI), pengaturan *Ketelitian AI di Chat*, fitur UI. | Saat menambahkan kapabilitas produk baru, selector model, atau mengubah requirement pengguna. |
| **3** | [**`ipc-contracts.md`**](./ipc-contracts.md) | **Kontrak Tauri Command & Event IPC**<br>Daftar lengkap command & event yang benar-benar terdaftar di `crates/soraja-desktop/src/main.rs`. | Sebelum memanggil/menambah `invoke()` atau `listen()`. Wajib diperbarui di commit yang sama dengan perubahan `main.rs`. |
| **4** | [**`agent-protocols.md`**](./agent-protocols.md) | **Protokol 5 CLI Agen ↔ UI**<br>Matriks flag per CLI, pemetaan stream JSON → event UI, autentikasi, HITL, dan mode demo fallback. | Saat mengubah `cliAdapters.ts`, parser stream agen, alur resume sesi, atau kebijakan izin. |
| **5** | [**`database-schema.sql`**](./database-schema.sql) | **Skema DDL Database Relasional SQLite**<br>Tabel workspaces, accounts, agent_sessions (+`cli_session_id`), execution_logs, pty_sessions, permission_rules, app_settings. | Saat membuat migrasi database, menambah kolom, atau mengoptimalkan query SQLite WAL. |

---

## 🛡️ Prinsip Rekayasa Baku
1. **Dilarang Mengubah Nama Kontrak IPC Sembarangan:** Perubahan nama fungsi di Rust `crates/` wajib mencerminkan tipe di TypeScript `desktop-ui/` sesuai [`ipc-contracts.md`](./ipc-contracts.md).
2. **Modularitas Berkas (< 500 Baris):** Seluruh file implementasi kode di frontend maupun backend wajib dipecah menjadi sub-komponen jika mendekati batas 500 baris.
3. **Keamanan Tanpa Kompromi:** Kredensial wajib menggunakan Windows DPAPI Keyring, dan perintah terminal destruktif wajib lolos konfirmasi Human-in-the-Loop (HITL).
