# Product Requirement Document (PRD)
## SORAJA ENGINE (Desktop & CLI) - v1.0.0

### 1. Visi Produk
Platform *Agentic Command Center* lokal untuk Windows yang menyatukan **4 agen coding CLI resmi** — **Antigravity** (`agy`), **Claude Code** (`claude`), **Codex** (`codex`), dan **OpenCode** (`opencode`) — dalam satu aplikasi desktop. Soraja **tidak membuat agen sendiri dan tidak memanggil API LLM secara langsung**; Soraja menjalankan biner CLI asli yang sudah terpasang dan login di mesin pengguna, lalu menyajikannya dalam dua mode:

| Mode | Pengalaman | Mekanisme |
| :--- | :--- | :--- |
| **Chat GUI** | Seperti **Antigravity Desktop**: bubble chat, trajectory berpikir, kartu tool, panel diff, model & effort selector. | CLI dijalankan headless dengan output JSON streaming (`stream-json` / `--json`), di-parse menjadi komponen UI. |
| **Terminal CLI** | **Persis seperti membuka CLI masing-masing agen** di terminal: TUI asli, slash command (`/model`, `/usage`, dll.), login, prompt izin. | CLI dijalankan di pseudo-terminal (ConPTY) dan dirender oleh xterm.js dalam tab. |

Kedua mode berbagi folder workspace dan (bila didukung CLI) sesi yang sama, sehingga pengguna bisa melanjutkan percakapan GUI di terminal dan sebaliknya. Detail teknis: [`sdd-speckit.md`](./sdd-speckit.md) §11 dan [`agent-protocols.md`](./agent-protocols.md).

### 2. Lingkup Fitur Utama
1. **Katalog 4 Agen CLI Native:**  
   | `agent_id` | Nama di UI | Biner | Vendor |
   | :--- | :--- | :--- | :--- |
   | `antigravity` | Antigravity | `agy` | Google |
   | `claude` | Claude | `claude` (Claude Code) | Anthropic |
   | `codex` | Codex | `codex` | OpenAI |
   | `opencode` | OpenCode | `opencode` | SST / open source (multi-provider) |
   - Deteksi instalasi otomatis via `PATH` + unwrap shim npm (`get_available_cli_agents`). Agen yang belum terpasang ditampilkan dengan tombol/perintah instalasi.
   - **Daftar model tidak di-hardcode di UI.** Model diambil dari CLI (`get_agent_models`, mis. `agy models`, `opencode models`) dengan katalog bawaan di `soraja-core` hanya sebagai fallback. Opsi `cli-default` = biarkan CLI memakai model default/konfigurasinya.

2. **Tanpa Selector Penalaran di Chat GUI:**  
   - Chat GUI tidak menyediakan pilihan Low/Medium/High dan tidak mengirim flag effort ke CLI. Tingkat penalaran diatur pengguna lewat perintah bawaan CLI di tab Terminal (`/model`, `/effort`).
   - Daftar model di Chat GUI **identik dengan menu `/model`** tiap CLI (Antigravity: `agy models` dikelompokkan per model; Codex: `codex debug models` yang `visibility=list`; Claude: Default/Opus/Fable/Sonnet/Haiku; OpenCode: `opencode models`).

14. **Antigravity-Style Dynamic Model Popover:**  
   Selector model terintegrasi langsung di dalam bar input obrolan sebelah tombol `+` (`[+] [ Model Name ^ ]`). Mengklik trigger ini akan membuka popover vertikal ke atas:
   - Menampilkan model-model yang dinamis sesuai provider agen aktif (**Antigravity**, **Claude**, **Codex**, atau **OpenCode**), diambil dari `get_agent_models`.
   - Dilengkapi tautan bawah *Lihat kuota* menuju pengaturan akun & kuota.

15. **Standardisasi Lokalisasi Bahasa Indonesia & Keselarasan Ekosistem Web-Landing:**  
   Seluruh antarmuka aplikasi desktop (Sidebar, Header Canvas, Modal Pengaturan, Modal Riwayat, Modal Tugas, Modal Wizard, Dialog Konfirmasi) dan halaman publik web portal `web-landing` diselaraskan menggunakan Bahasa Indonesia alami serta identitas agen resmi: **Antigravity**, **Claude**, **Codex**, dan **OpenCode**. Jawaban agen di mode Chat GUI maupun Terminal CLI diwajibkan berbahasa Indonesia (lihat poin 10).

16. **Models & Usage Quota Management (Batas Harian, Mingguan & Circular Progress):**  
   - **Semua angka berasal dari CLI** (lihat [`agent-protocols.md`](./agent-protocols.md) §4): paket asli (mis. "Claude Pro", "ChatGPT Free"), email akun, sisa kuota 5 jam & mingguan/30 hari beserta waktu reset. Bila CLI tidak melaporkan suatu jendela kuota, UI menampilkan "Tidak dilaporkan oleh CLI" — tidak ada angka default/karangan.  
   - Menampilkan limit harian (Five Hour Limit) dan limit mingguan (Weekly Limit) secara presisi.
   - Pemakaian token & persentase sisa kuota divisualisasikan dengan circular SVG progress ring animasi interaktif (e.g. 68%, 100%).
   - Tampilan paket akun tiap agen (Free/Biasa, Pro, Ultra, Plus) e.g., "Your Plan: Google AI Pro", tombol *Upgrade*, dan toggle switch interaktif *Enable AI Credit Overages* dengan persistensi database.
   - **Filter Koneksi Ketat:** Hanya agen AI yang statusnya telah terhubung (`isConnected: true`) via Windows DPAPI yang ditampilkan dalam ringkasan kuota Models & Usage.

17. **Universal Antigravity Controls & 5-Option HITL Terminal Modal:**  
   - Seluruh 4 agen AI (Antigravity, Claude, Codex, OpenCode) mendukung kontrol Antigravity lengkap: model selector popover, bottom chat toolbar `[+] [ Model ^ ]`, serta tautan langsung *Lihat Penggunaan (View Usage)*.
   - Modal izin eksekusi terminal Human-in-the-Loop (HITL) dengan banner "2 Running background tasks", preview command terminal terintegrasi, dan 5 opsi izin radio granular:
     1. *Allow once* (Izinkan sekali)
     2. *Always allow in this conversation* (Selalu izinkan di percakapan ini)
     3. *Always allow in this project* (Selalu izinkan di ruang kerja proyek ini)
     4. *Always allow globally* (Selalu izinkan secara global)
     5. *Reject / Do not allow* (Tolak eksekusi perintah)
     Dilengkapi tombol *Skip* dan *Submit* dengan notifikasi toast eksekusi.

18. **Interactive Code Review & Docked Split-Pane Diff Viewer:**  
   - **Single Edit Pill:** Pill individual dalam trajectory chat: `Edited 🌐 <file> +X -Y` yang dapat diklik langsung untuk membuka tinjauan diff berkas tersebut.
   - **Tinjau Perubahan Kode (Aggregated Code Review Card):** Kotak ringkasan di akhir jawaban agen yang menampilkan daftar seluruh file yang dimodifikasi dengan indikator hijau `+X` dan merah `-Y`, serta tombol aksi: *Tinjau Semua Perubahan*, *Terima*, dan *Abaikan*.
   - **Docked Right-Hand Split-Pane Diff Viewer:** Panel docked di sisi kanan chat feed yang menampilkan breadcrumb path file, tab berkas multi-file, baris diff berwarna merah (hapus) & hijau (tambah) dengan nomor baris ganda, chunk banner terlipat (`+591 baris tersembunyi`), dan tombol *Terima Perubahan*.

19. **Clean Workspace Header, Distinct Pro vs Flash Model Lineup & Clean Empty Sessions:**  
   - **Header Bersih & Ramping:** Menghapus dropdown model duplikat, tombol budget thinking, dan dropdown kebijakan warna kuning (*Tool Execution Policy*) dari header atas. Header difokuskan murni sebagai navigasi breadcrumb Proyek/Branch/Sesi dan tombol pengujian guardrail HITL.
   - **Model Terintegrasi di Bawah:** Kontrol pemilihan model dikelola melalui popover bar obrolan bawah (`[+] [ Model ^ ]`).
   - **Pembeda Model Nyata (Pro vs Flash):** Menghilangkan pemotongan nama string sehingga tidak ada lagi kebingungan duplikasi nama ("Gemini 2.5"). Setiap model menampilkan nama resmi lengkap beserta badge visual kategori (`PRO`, `FLASH`, `THINKING`, `PREVIEW`, `ULTRA`, `HYBRID`, `CODER`).
   - **Sesi Awal Bersih (Kosongan Saja):** Menghapus seluruh pesan benih default ("Selamat datang di SORAJA ENGINE Command Center...") dari database maupun inisialisasi percakapan/proyek baru, sehingga antarmuka dimulai dalam kondisi kanvas obrolan kosong yang bersih dan elegan.

20. **Presisi Tampilan Models & Usage 1:1 Antigravity Desktop & Inspeksi Database SQLite:**  
   - **Tampilan Identik Models & Usage:** Antarmuka modal *Models & Usage* diselaraskan 100% dengan Google Antigravity Desktop asli (`media_1791192882768.png`):
     - *Catatan: angka & nama paket di poin ini hanya ilustrasi tata letak dari screenshot referensi. Nilai sebenarnya selalu dibaca dari CLI (poin 16).*
     - Bagian **Plan**: Kartu status paket pengguna dengan badge `Your Plan: Google AI Pro` dan tombol aksi `Upgrade`.
     - Bagian **Model Credits**: Kartu opsi toggle `Enable AI Credit Overages` untuk penagihan berbasis penggunaan jika kuota paket habis.
     - Bagian **Gemini Models**: Kartu kuota ganda dengan ring lingkaran progres hijau (`#22c55e`) berdiameter 28px:
       - *Weekly Limit Remaining*: `65%` (Refresh reset dalam `1 day, 20 hours`)
       - *Five Hour Limit Remaining*: `84%` (Refresh reset dalam `4 hours, 20 minutes`)
     - Bagian **Claude and GPT models**: Kartu kuota gabungan dengan indikator ring hijau `100%` (Weekly & Five Hour).
     - Header modal dengan tombol refresh sinkronisasi data kuota model dan tombol tutup `X` elegan.
   - **Mekanisme Reset DB ke Default:** Tombol utilitas maintenance / pemulihan bencana (*Factory Reset*) yang aman untuk mengembalikan konfigurasi lokal database SQLite ke kondisi pabrik awal saat terjadi inkonsistensi cache.
   - **Aksesibilitas & Inspeksi Database SQLite:**
     - *GUI & Status Bar*: Indikator live status di pojok sidebar pengaturan (`SQLite WAL • 2.4 KB`).
     - *Penyimpanan Fisik Windows (Desktop/Tauri)*: Berkas fisik database tersimpan di `%APPDATA%\soraja-ai\soraja.db` (beserta journal WAL `soraja.db-wal` dan `soraja.db-shm`), dapat dibuka langsung dengan DB Browser for SQLite atau DBeaver.
     - *Penyimpanan Web / Dev Server*: Persistensi lokal otomatis tersinkronisasi pada LocalStorage / IndexedDB browser di bawah origin `http://localhost:5173`.
     - *Skema SQL Proyek*: Dokumentasi struktur tabel DDL tersedia di `specs/database-schema.sql`.

22. **Multi-Agent Quota Command Center, Penyederhanaan Pengaturan, & Appearance Studio Kreatif:**  
   - **Multi-Agent Quota Command Center (Full Dinamis):**
     - Mengubah pendekatan dari layout Google-sentris yang kaku menjadi arsitektur multi-agen independen asli SORAJA AI. Dinamisasi murni berasal dari persentase dan konsumsi token di SQLite WAL.
     - Setiap agen yang terhubung (Antigravity, Claude, Codex, OpenCode) memiliki kartu kuota tersendiri yang menampilkan ring SVG sisa kuota mingguan (*Weekly Limit Remaining*) dan 5-jam (*Five Hour Limit Remaining*), durasi reset dinamis real-time, statistik token riil, email akun, badge plan tier (`PRO`, `ULTRA`, `PLUS`, `LOKAL`), serta tombol *Ubah Kunci* dan *Putuskan*.
     - **Tata Letak Elegan Multi-Koneksi (3 Agen Terhubung):** Menggunakan sistem grid adaptif yang menjaga isolasi data tiap agen ketika 3 atau lebih agen aktif bersamaan tanpa distorsi visual.
     - Agen yang belum terhubung dikelompokkan terpisah dengan tombol aksi cepat `+ Hubungkan [Agent]` langsung menuju modal DPAPI.
   - **Penyederhanaan Pengaturan:**
     - Menghapus tombol *Reset DB ke Default* dari sidebar pengaturan demi keamanan data pengguna, digantikan indikator kesehatan database bersih: `SQLite WAL • X KB`.
     - Menghapus tab *Aplikasi* (Application) dari daftar kategori pengaturan, menyisakan 3 pilar esensial: *Umum* (mode kerja AI Aman/Otonom & tampilan obrolan), *Tampilan* (tema, warna aksen, kontras — satu klik), dan *Akun & Kuota AI* (akun, paket & kuota dinamis dari CLI). Tab *Kustomisasi* (skills/MCP) dihapus (Okt 2026) karena tidak terhubung ke agen CLI.
   - **Appearance Studio (Kustomisasi Tampilan Penuh):**
     - **Mode Tampilan & Kontras:** Pilihan Sistem, Terang, Gelap, serta tingkat kontras (Default & Kuat).
     - **Preset Tema Gelap:** Menyediakan preset *Default Dark*, *Midnight Aurora*, *Deep Space Violet*, *Emerald Terminal*, dan *Solar Amber*, dilengkapi tombol *Reset Default (↺)*.
     - **Kustomisasi Palet Hex:** Kontrol pemilihan warna visual dan input teks Hex untuk Background, Foreground, dan Warna Aksen.
     - **Live Code Preview Box:** Menampilkan pratinjau kode sintaksis real-time (`agent_preview.ts`) yang bereaksi instan terhadap warna dan aksen yang dikonfigurasi.
     - **Pengaturan Obrolan:** Sakelar *Verbose Agent Chat* untuk otomatisasi pembukaan alur penalaran thinking, serta *Lebar Percakapan* segmented control (`Ringkas`, `Standar`, `Penuh`) yang terhubung langsung ke lebar bubble chat.

23. **Arsitektur Modular & Standar Maksimal 500 Baris Per Kelas/File (FE & BE):**  
   - Kebijakan tegas batas maksimal 500 baris per file/kelas di seluruh arsitektur Frontend dan Backend untuk memastikan keterbacaan kode, kemudahan review, dan pemisahan tanggung jawab (separation of concerns).
   - Dekomposisi monolitik `App.tsx` (dari 3.873 baris) dan `db.ts` (dari 649 baris) menjadi modul-modul independen:
     - `desktop-ui/src/types/agent.ts` & `database.ts`: Kontrak antarmuka data dan tipe agen.
     - `desktop-ui/src/constants/agentProviders.tsx`: Registry provider model AI dan tema preset.
     - `desktop-ui/src/services/agentEngine.ts`: Engine analisis inferensi dan diff generator.
     - `desktop-ui/src/services/dbDefaults.ts` & `db.ts`: Driver basis data SQLite WAL.
     - `desktop-ui/src/hooks/useWorkspaceState.ts` & `useAppTheme.ts`: Manajemen state terpusat dan reaktivitas tema.
     - `desktop-ui/src/components/sidebar/Sidebar.tsx`: Navigasi ruang kerja, accordion proyek, dan filter segmented.
     - `desktop-ui/src/components/header/Header.tsx`: Breadcrumb proyek aktif dan tombol uji HITL.
     - `desktop-ui/src/components/chat/ChatFeed.tsx`, `ChatInputBar.tsx`, & `ModelSelectorDropdown.tsx`: Bilah interaksi dan drawer CoT.
     - `desktop-ui/src/components/diff/DiffReviewPanel.tsx`: Panel docked peninjauan perubahan kode per-baris.
     - `desktop-ui/src/components/settings/SettingsModal.tsx`, `AppearanceTab.tsx`, & `ModelsUsageDashboard.tsx`: Modal pengaturan dan kuota multi-agen.
     - `desktop-ui/src/components/modals/*`: Dialog terisolasi (New Project Wizard, DPAPI Credentials, HITL Terminal, History, Scheduled Tasks, Confirm Dialog).
     - `crates/*`: Submodul Rust backend dipertahankan sangat ringkas (< 90 baris per berkas).
   - Status audit (12 Okt 2026): **belum 100% patuh** — `desktop-ui/src/components/terminal/EmbeddedCliTerminal.tsx` (1.801 baris) dan `crates/soraja-desktop/src/main.rs` (544 baris) wajib dipecah (mis. `pty.rs`, `headless.rs`, `catalog_cmds.rs`).

24. **Eksekusi Berkas & Terminal oleh Agen CLI:**  
    Baca/tulis berkas dan eksekusi shell dilakukan oleh tools bawaan masing-masing CLI di dalam workspace. Command Soraja (`read_workspace_file`, `write_workspace_file`, `list_workspace_files`, `run_workspace_terminal`) dipakai UI untuk fitur pendukung (autocomplete `@`, menghitung diff untuk panel review, menjalankan perintah cepat) — bukan sebagai mesin agen.

25. **Model Selector Dinamis dari CLI:**  
    Katalog model tidak dikurasi manual di dokumen ini. Model yang tampil adalah yang dilaporkan oleh CLI/akun pengguna (`get_agent_models`), sehingga otomatis mengikuti rilis model terbaru tanpa update aplikasi. Katalog fallback di `crates/soraja-core/src/agent_catalog.rs` wajib diperbarui berkala.

26. **52 Skills Registry & Dynamic Token Budgeting (20K Ceiling):**  
    Registri 52 skills ilmiah, developer, dan kustomisasi dengan pelindung batas pagu 20,000 token terintegrasi.

27. **Multimodal 10-Image Vision Pipeline:**  
    Mendukung drag-and-drop dan paste clipboard hingga 10 gambar sekaligus dengan verifikasi batas dan galeri kartu thumbnail.

28. **Instant Folder Onboarding:**  
    Pemilihan folder proyek melalui file dialog langsung mengaktifkan workspace dan percakapan baru tanpa tahap konfirmasi berlebih.

29. **Spesifikasi Formal SDD SpecKit (`specs/sdd-speckit.md`):**  
    Cetak biru arsitektur lengkap yang mendokumentasikan kontrak IPC, skema database, dan guardrail keamanan untuk AI Coding Assistant dan pengembang.

### 3. Arsitektur Komponen (Modular Monolith)
* `crates/soraja-core`: Shared Rust engine (deteksi & katalog agen CLI, token tracker, DPAPI auth, DB layer, skills).
* `crates/soraja-desktop`: Backend Tauri & IPC routers (PTY interaktif, spawn headless, katalog). Kontrak: [`ipc-contracts.md`](./ipc-contracts.md).
* `crates/soraja-cli`: Utilitas CLI headless milik Soraja (opsional; bukan fitur Terminal CLI agen).
* `desktop-ui`: Antarmuka aplikasi GUI React 19 + Vite (arsitektur modular < 500 baris per komponen).
* `web-landing`: Situs publik Astro untuk download installer.


