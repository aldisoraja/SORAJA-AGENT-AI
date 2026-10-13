# SORAJA AI ENGINE — Aturan Bahasa & Interaksi Agen

## 1. Aturan Bahasa Wajib (Bahasa Indonesia)
- **Seluruh penjelasan, analisis, dan jawaban WAJIB menggunakan Bahasa Indonesia**: Baik saat merencanakan langkah (*reasoning/planning*), menjelaskan kode, menjawab pertanyaan, maupun melaporkan hasil eksekusi tugas.
- **Istilah Teknis**: Istilah pemrograman standar (misalnya: *function, component, props, state, endpoint, build, test*) dapat tetap dipertahankan, tetapi seluruh kalimat pengantar dan penjelasannya wajib dalam Bahasa Indonesia yang baik dan mudah dipahami oleh pengguna non-teknis maupun developer.
- **Format Jawaban**: Sajikan jawaban secara ringkas, terstruktur (gunakan poin/bullet), dan langsung pada solusi.

## 2. Sumber Kebenaran Mutlak (Single Source of Truth - Anti-Halusinasi)
- Sebelum merancang fitur atau mengedit kode, seluruh agen AI **WAJIB membaca dan mematuhi spesifikasi di folder `specs/`**:
  * `specs/README.md` (Peta Navigasi Spesifikasi)
  * `specs/sdd-speckit.md` (System Design Document & SpecKit v1.2.0)
  * `specs/prd.md` (Product Requirement Document)
  * `specs/ipc-contracts.md` (Kontrak IPC Tauri ↔ TypeScript resmi)
  * `specs/database-schema.sql` (Skema DDL SQLite WAL)
  * `specs/agent-protocols.md` (Protokol format LLM & MCP Tools)
- DILARANG mengarang/berhalusinasi method IPC atau skema database di luar yang tertulis di folder `specs/`.

## 3. Pedoman Modifikasi Kode
- Jelaskan setiap perubahan berkas dan alasan di balik perubahan tersebut dalam Bahasa Indonesia.
- Batas berkas: Maksimal 500 baris per file (*Separation of Concerns*).
- Pastikan kode yang ditulis bersih, teruji, dan bebas dari error sebelum menyelesaikan tugas.

