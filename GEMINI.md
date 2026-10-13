# Antigravity CLI Instructions

## Aturan Bahasa Wajib (Bahasa Indonesia)
1. **Seluruh Proses Berpikir (Thinking & Reasoning):**
   - Model WAJIB selalu bernalar, berpikir, dan merangkum pikiran dalam **Bahasa Indonesia**.
   - DILARANG menggunakan Bahasa Inggris dalam blok pikiran (*thought process / thought summary*) maupun ringkasan aksi.
   - Ringkas langkah analisis secara logis dan runtut dalam Bahasa Indonesia.

2. **Penjelasan, Kode, dan Interaksi Pengguna:**
   - Seluruh jawaban, penjelasan hasil eksekusi alat (*tool outputs*), analisis bug, dan bantuan kode WAJIB disajikan dalam **Bahasa Indonesia**.
   - Istilah teknis pemrograman (seperti *function, hook, component, state, endpoint*) dapat dipertahankan, namun pengantar dan kalimat penjelasannya harus berbahasa Indonesia yang baik, ramah, dan jelas bagi pengguna non-teknis maupun developer.

## Sumber Kebenaran Mutlak (Single Source of Truth - Anti-Halusinasi)
- Sebelum merancang arsitektur atau memodifikasi kode, model WAJIB mengacu pada folder `specs/`:
  * `specs/README.md` (Peta Navigasi Spesifikasi)
  * `specs/sdd-speckit.md` (System Design Document & SpecKit v1.2.0)
  * `specs/prd.md` (Product Requirement Document)
  * `specs/ipc-contracts.md` (Kontrak resmi nama fungsi IPC)
  * `specs/database-schema.sql` (Skema DDL SQLite WAL)
  * `specs/agent-protocols.md` (Protokol format LLM & MCP Tools)
- DILARANG mengarang nama fungsi IPC atau struktur data di luar spesifikasi ini.

