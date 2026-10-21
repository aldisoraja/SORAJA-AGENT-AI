# Tauri IPC Contracts (Rust ↔ TypeScript)

> **Sumber kebenaran:** `crates/soraja-desktop/src/main.rs` (`tauri::generate_handler![...]`), implementasi di
> `crates/soraja-desktop/src/commands/*.rs` (`pty`, `headless`, `session_control`, `permission_bridge`, `antigravity_grants`,
> `catalog`, `language_rules`, `skills`, `workspace`, `attachments`).
> Dokumen ini WAJIB diperbarui di commit yang sama setiap kali command/event ditambah, diubah, atau dihapus.
> Dilarang memanggil `invoke('<nama>')` yang tidak tercantum di sini.

## 0. Konvensi
* **Nama command:** `snake_case` (Rust). Argumen di sisi TypeScript otomatis `camelCase` oleh Tauri v2 (`session_id` → `sessionId`).
* **Nama event:** format `<domain>:<aksi>` dengan titik dua (`pty:output`, `agent:token_stream`). Payload event memakai key `camelCase`.
* **Serialisasi struct:** struct `soraja-core` (`CliAgentProvider`, `CliModelItem`, `UserCliProfile`, `AgentTokenStats`) memakai `#[serde(rename_all = "camelCase")]`; `CliAgentStatus` tetap `snake_case`.
* **Capability (WAJIB):** `crates/soraja-desktop/capabilities/default.json` memberi window `main` izin `core:default` (termasuk `event.listen` untuk `pty:output`/`agent:*`), `opener:default`, dan `dialog:default`. Tanpa berkas ini event stream ditolak di aplikasi desktop.
* **Plugin dialog:** pemilih folder proyek memanggil `invoke('plugin:dialog|open', { options: { directory: true } })` (`tauri-plugin-dialog`) → path absolut asli. Menu terminal "Sisipkan Berkas dari Komputer" memanggil `plugin:dialog|open` dengan `{ multiple: true, directory: false }`; path absolut berkas terpilih diketik apa adanya (berkutip) ke prompt CLI, tanpa menyalin berkas.
* **Error:** semua command mengembalikan `Result<T, String>`; pesan error berbahasa Indonesia.
* **Identitas sesi:** `sessionId` dibuat oleh frontend dan dipakai untuk korelasi event dan kontrol proses (mode chat: id pesan agen `agt-<timestamp>`; mode terminal: `pty-<agent>-<timestamp>`). `pid` adalah PID OS proses CLI (dikirim via `agent:session_start`, hanya informasi).
* **Job Object (Windows):** setiap proses CLI (PTY maupun headless) diikat ke Job Object `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` segera setelah spawn (`commands/process_job.rs`). Stop/tutup sesi mematikan seluruh pohon proses; Soraja ditutup/crash → semua proses agen ikut mati; CLI yang keluar normal melepas job tanpa mematikan proses latar yang ditinggalnya.

---

## 1. Mode Terminal — PTY Interaktif (CLI native persis seperti aslinya)

Aturan konkurensi (mencegah terminal beku / input hilang — bug Okt 2026):
* Kelima command PTY bersifat `async` (tidak berjalan di thread utama UI).
* `start_interactive_pty` **idempoten** per `session_id`: spawn kedua untuk sesi yang masih hidup diabaikan (React StrictMode memanggil effect dua kali di mode dev).
* Thread `wait()` memiliki `Child` sendiri; kill memakai `ChildKiller` terpisah → tidak ada mutex yang tertahan selama proses hidup.
* `pty:exit` hanya dikirim oleh proses yang **masih memiliki** sesi (dicek dengan nomor generasi), lalu entri sesi dihapus.
* Output didekode UTF-8 secara streaming (karakter multi-byte yang terpotong di batas buffer tidak rusak).
* Frontend (`terminal/ptyTransport.ts`): spawn dibagi per `sessionId`, close ditunda 250 ms (`ptyRelease`) dan dibatalkan oleh mount ulang (`ptyRetain`). Dev server Vite memakai aturan kepemilikan yang sama.

### `start_interactive_pty`
Menjalankan biner CLI agen (`agy`, `claude`, `codex`, `opencode`, `kiro-cli`) di dalam pseudo-terminal (ConPTY via `portable-pty`). Shim npm `.cmd/.bat` di-unwrap menjadi `node <target.js>`. Env: `TERM=xterm-256color`, `COLORTERM=truecolor`, `LANG=en_US.UTF-8`, ditambah `envs` (mis. `OPENCODE_CONFIG_CONTENT` untuk aturan bahasa). Argumen disusun `buildInteractiveCommand` ([`agent-protocols.md`](./agent-protocols.md) §2, §5). `cwd` kosong → direktori kerja proses.
* **Input:** `session_id: String, agent_executable: String, agent_args: Vec<String>, cwd: String, cols: u16, rows: u16, envs: Option<HashMap<String, String>>` (`0` → default 100×24)
* **Output:** `Result<(), String>`
* **Event dipicu:** `pty:output`, `pty:exit`

### `attach_interactive_pty`
Menyambungkan UI yang baru dimuat (mis. setelah reload webview) ke sesi yang masih hidup. Mengembalikan riwayat output sesi (maks. 512 KB, dipangkas di batas baris) dan `endSeq`. Event `pty:output` dengan `seq <= endSeq` sudah termasuk di snapshot dan wajib dibuang UI. Sesi tidak ada → `alive: false`, `data: ""`. Dipanggil otomatis oleh `subscribePty` (`terminal/ptyTransport.ts`), yang menahan output live sampai snapshot dimuat.
* **Input:** `session_id: String`
* **Output:** `Result<{ alive: boolean, data: string, endSeq: number }, String>`

### `write_interactive_pty`
Meneruskan input keyboard xterm.js (termasuk escape sequence) ke stdin PTY. Error bila sesi tidak aktif.
* **Input:** `session_id: String, data: String`
* **Output:** `Result<(), String>`

### `resize_interactive_pty`
* **Input:** `session_id: String, cols: u16, rows: u16`
* **Output:** `Result<(), String>`

### `close_interactive_pty`
Menghapus sesi dari state dan mematikan CLI beserta seluruh anak prosesnya (`TerminateJobObject`; fallback `kill()` proses CLI).
* **Input:** `session_id: String`
* **Output:** `Result<(), String>`

---

## 2. Mode Chat GUI — CLI Headless (stream JSON)

### `spawn_headless_agent`
Menjalankan CLI agen non-interaktif (`CREATE_NO_WINDOW`). Argumen disusun `buildHeadlessCommand` (`desktop-ui/src/services/cli/agentCommands.ts`) sesuai [`agent-protocols.md`](./agent-protocols.md) §2. Setiap baris stdout/stderr di-emit sebagai `agent:token_stream`.
stdin `null`, kecuali `stdin_pipe = true`: stdin dibiarkan terbuka untuk protokol JSON-RPC (`codex app-server`, `opencode acp`, `kiro-cli acp`; argumen dari `buildRpcCommand`) dan ditulisi lewat `write_headless_agent_stdin`.
* **Input:** `session_id: String, agent: String, agent_executable: String, agent_args: Vec<String>, cwd: String, envs: HashMap<String, String>, stdin_pipe: Option<bool>` (opsional, bawaan `false`)
* **Output:** `Result<(), String>`
* **Event dipicu:** `agent:session_start`, `agent:token_stream`, `agent:session_end`

### `write_headless_agent_stdin`
Menulis ke stdin CLI headless yang dispawn dengan `stdin_pipe = true` (satu pesan JSON-RPC per baris, berurutan per sesi).
`close = true` menutup stdin setelah menulis: Codex app-server / OpenCode ACP lalu keluar sehingga `agent:session_end` terpicu.
CLI yang tidak keluar dalam 8 detik (Kiro v3 ACP) dimatikan Soraja; karena gilirannya sudah selesai, `agent:session_end` melaporkan `exitCode: 0`.
* **Input:** `session_id: String, data: String, close: bool`
* **Output:** `Result<(), String>` — error bila sesi sudah berakhir atau stdin sudah ditutup

### `set_antigravity_command_grant`
Izin perintah persis untuk HITL Antigravity (agy headless tidak bisa bertanya izin). `granted = true` menambahkan
`command(<command>)` ke `permissions.allow` di `~/.gemini/antigravity-cli/settings.json`; `false` mencabutnya, hanya bila aturan itu
ditambahkan Soraja (aturan milik pengguna tidak disentuh). Dipakai `useAntigravityApprovals` selama satu giliran lanjutan.
* **Input:** `command: String, granted: bool`
* **Output:** `Result<(), String>`

### `stop_agent_session`
Hard abort seluruh pohon proses CLI sesi: `TerminateJobObject` (Windows; fallback `taskkill /F /T /PID`) atau `kill -9`.
Sesi yang tidak dikenal / sudah berakhir → `Ok(())`. Implementasi: `commands/session_control.rs`.
* **Input:** `session_id: String` (sama dengan `sessionId` di `spawn_headless_agent`)
* **Output:** `Result<(), String>`

### `pause_agent_session` / `resume_agent_session`
Menjeda / melanjutkan **seluruh proses di Job Object sesi** via `NtSuspendProcess` / `NtResumeProcess` (Windows; fallback
proses CLI saja) atau `SIGSTOP` / `SIGCONT`.
* **Input:** `session_id: String`
* **Output:** `Result<(), String>` — error bila sesi sudah tidak berjalan

### `prepare_permission_bridge`
Menyalakan (sekali per aplikasi) jembatan izin HITL Chat GUI: MCP server HTTP lokal di `127.0.0.1:<port acak>` dengan token acak,
lalu mengembalikan URL MCP untuk satu sesi. Dipakai Claude headless mode aman lewat `--mcp-config` + `--permission-prompt-tool
mcp__soraja__approval_prompt` (lihat [`agent-protocols.md`](./agent-protocols.md) §7). Implementasi: `commands/permission_bridge.rs`.
* **Input:** `session_id: String` (id pesan agen = `sessionId` di `spawn_headless_agent`)
* **Output:** `Result<String, String>` — `http://127.0.0.1:<port>/mcp/<token>/<session_id>`
* **Event dipicu:** `agent:permission_request` (tiap kali CLI meminta izin)

### `approve_human_in_the_loop`
Keputusan pengguna atas modal HITL Chat GUI, diteruskan ke CLI yang sedang menunggu (`allow` + input asli, atau `deny` dengan pesan
"Ditolak oleh pengguna di Soraja."). Permintaan yang belum dijawab otomatis ditolak saat sesi berakhir (`agent:session_end`).
* **Input:** `session_id: String, tool_call_id: String, approved: bool` — `tool_call_id` = `requestId` dari `agent:permission_request`
* **Output:** `Result<(), String>` — error bila permintaan sudah tidak aktif atau milik sesi lain

---

## 3. Katalog, Deteksi Agen CLI & Aturan Bahasa

> **Catatan eksekusi:** `get_available_cli_agents`, `get_agent_providers`, `get_agent_models`, `get_agent_token_stats`, `get_user_cli_profile`, dan `trust_and_prepare_workspace_for_cli` adalah command **`async`** yang menjalankan kerjanya di `tokio::task::spawn_blocking`. Command sinkron berjalan di main thread Tauri dan membekukan UI selama CLI berjalan, jadi command yang menjalankan proses CLI **wajib** `async`. Nama, input, dan output tidak berubah. Di sisi core: perintah CLI dibatasi timeout 10 detik (`run_cli`), katalog model di-cache 30 menit per agen (proses probe berprioritas BELOW_NORMAL di Windows), dan kelima provider dibangun paralel. `get_available_cli_agents` HANYA mendeteksi biner (`get_agent_install_status`, tanpa menjalankan CLI, `models` tidak dipakai) sehingga aman dipanggil saat startup dan saat wizard "ganti agen" dibuka; katalog model lengkap hanya dari `get_agent_providers`.

### `get_available_cli_agents`
* **Input:** `()`
* **Output:** `Result<Vec<CliAgentStatus>, String>`
```ts
interface CliAgentStatus { id: string; name: string; executable: string; is_installed: boolean; path: string | null; vendor: string; description: string; }
```

### `get_agent_providers`
Katalog otoritatif 5 agen (`antigravity`, `claude`, `codex`, `opencode`, `kiro`) beserta status instalasi dan model.
* **Input:** `()`
* **Output:** `Result<Vec<CliAgentProvider>, String>`
```ts
interface CliAgentProvider { id: string; name: string; vendor: string; executable: string; iconName: string; accent: string; badgeColor: string; description: string; isInstalled: boolean; binaryPath: string | null; defaultModelId: string; models: CliModelItem[]; }
interface CliModelItem { id: string; name: string; badge: string | null; desc: string; speed: string; contextWindow: string | null; supportsImages: boolean | null; }  // supportsImages: OpenCode dari `opencode models --verbose` (capabilities.input.image); null = tidak diketahui
```

### `get_agent_models`
Daftar model live dari CLI (mis. `agy models`, `opencode models`), fallback ke katalog bawaan.
* **Input:** `agent_id: String`
* **Output:** `Result<Vec<CliModelItem>, String>`

### `get_agent_token_stats`
Pemakaian & **sisa kuota asli** dari data milik CLI (`soraja-core/src/cli_accounts/`, lihat [`agent-protocols.md`](./agent-protocols.md) §4). Field `null` = CLI tidak melaporkannya; UI wajib menampilkan "tidak dilaporkan", bukan angka karangan.
* **Input:** `agent_id: String`
* **Output:** `Result<AgentTokenStats, String>`
```ts
interface AgentTokenStats {
  agentId: string;
  quotaKnown: boolean;
  weeklyLimitPercent: number | null;   // sisa kuota jendela panjang (mingguan / 30 hari)
  fiveHourLimitPercent: number | null; // sisa kuota 5 jam
  weeklyResetAt: number | null;        // Unix detik
  fiveHourResetAt: number | null;
  weeklyWindowMinutes: number | null;  // 10080 = mingguan, 43200 = 30 hari
  inputTokens: number; outputTokens: number; usedWeeklyTokens: number;
  totalCostUsd: number | null; sessionsCount: number; messagesCount: number;
  source: string; statusMessage: string;
}
```

### `get_user_cli_profile`
Profil akun yang sedang login di CLI: status login, email, **paket langganan asli**. Token/kunci rahasia tidak pernah dibaca atau dikirim. String kosong = tidak diketahui.
* **Input:** `agent_id: String`
* **Output:** `Result<UserCliProfile, String>`
```ts
interface UserCliProfile {
  agentId: string;
  isLoggedIn: boolean;
  authMethod: 'subscription' | 'api_key' | 'multi_provider' | 'none';
  name: string; email: string;
  planTier: string;     // "Pro", "Max", "Plus", "Free", "Multi-provider"
  accountType: string;  // "Claude Pro", "ChatGPT Free", "OpenCode (3 provider)"
  statusDetails: string; source: string; detectedAt: string;
}
```

### `trust_and_prepare_workspace_for_cli`
Mendaftarkan folder ke daftar trusted workspace CLI agar tidak memblokir saat start (saat ini: `~/.gemini/antigravity-cli/settings.json` → `trustedWorkspaces` untuk `antigravity`).
* **Input:** `workspace_path: String, agent_id: String`
* **Output:** `Result<String, String>`

### `prepare_agent_language_rules`
Menyiapkan aturan "jawab dalam Bahasa Indonesia" ([`agent-protocols.md`](./agent-protocols.md) §5): menulis `%APPDATA%\soraja-ai\rules\bahasa-indonesia.md`; untuk `antigravity` juga menambahkan blok bertanda ke `~/.gemini/antigravity-cli/instructions.md` (sekali, hanya bila folder config agy sudah ada dan belum ada aturan Bahasa Indonesia). Hasil di-cache per agen oleh `prepareLanguageRules()` di frontend.
* **Input:** `agent_id: String`
* **Output:** `Result<String, String>` — path berkas aturan (pemisah `/`)

---

## 4. Workspace, Berkas & Terminal Satu-Kali

### `get_workspaces`
* **Input:** `()`
* **Output:** `Result<Vec<Workspace>, String>` — `{ id, name, path }`. *Status: masih mengembalikan data statis; target: baca tabel `workspaces`.*

### `read_workspace_file`
* **Input:** `path: String`
* **Output:** `Result<String, String>`

### `write_workspace_file`
Menulis berkas; membuat direktori induk otomatis (`create_dir_all`).
* **Input:** `path: String, content: String`
* **Output:** `Result<(), String>`

### `list_workspace_files`
Memindai pohon berkas (kedalaman maks. 8), melewati entri berawalan `.`, `node_modules`, `target`, `dist`. Path relatif dengan `/`.
* **Input:** `base_path: String`
* **Output:** `Result<Vec<String>, String>`

### `run_workspace_terminal`
Eksekusi perintah satu kali via PowerShell (non-PTY). Ditolak bila `TerminalExecutor::is_destructive_command` cocok. Exit code ≠ 0 tetap `Ok` dengan awalan `Terminal Error [Code: N]`. Dipakai antara lain untuk `git diff` panel review.
* **Input:** `workspace_path: String, command: String`
* **Output:** `Result<String, String>` (stdout)

### `save_chat_attachment`
Menyimpan satu lampiran Chat GUI (gambar/dokumen) ke `<project_path>/.soraja/attachments/<message_id>/<file_name>` agar CLI agen bisa membacanya (lihat [`agent-protocols.md`](./agent-protocols.md) §2). `message_id` & `file_name` disanitasi (hanya `[A-Za-z0-9._-]`, tanpa path traversal); folder `.soraja` diberi `.gitignore` berisi `*`. Batas 25 MB per berkas. Implementasi: `commands/attachments.rs`; padanan browser dev: `POST /api/save-chat-attachment` (`headlessBridge.ts`).
* **Input:** `project_path: String, message_id: String, file_name: String, data_base64: String` (data URL atau base64 murni)
* **Output:** `Result<String, String>` — path absolut berkas yang tersimpan

---

## 5. Kredensial & Skills

### `save_account_credential`
Menyimpan API key opsional ke Windows Credential Manager (DPAPI) via `keyring`. Lihat catatan autentikasi di [`agent-protocols.md`](./agent-protocols.md) §4.
* **Input:** `provider: String, secret_token: String`
* **Output:** `Result<(), String>`

### `get_skills`
Registri skill `soraja-core` (12 skill bawaan) dari satu state aplikasi (`commands/skills.rs`). Belum dipakai UI.
* **Input:** `()`
* **Output:** `Result<Vec<SkillDefinition>, String>`

### `toggle_skill`
Mengubah status aktif skill dan menyimpannya ke `%APPDATA%\soraja-ai\skills.json` (dimuat ulang saat aplikasi dibuka).
Mengaktifkan skill yang membuat total `token_cost` skill aktif melewati `max_token_budget` (20.000) → error.
* **Input:** `skill_id: String, enabled: bool`
* **Output:** `Result<bool, String>` — `false` bila `skill_id` tidak dikenal

---

## 6. Events (Rust → Frontend)

| Event | Payload | Sumber | Konsumen UI |
| :--- | :--- | :--- | :--- |
| `pty:output` | `{ sessionId: string, data: string, seq: number }` | `start_interactive_pty` (chunk 4 KB, UTF-8 lossy) | `terminal/ptyTransport.ts` → `xterm.write()` (dilokalisasi kecuali OpenCode) |
| `pty:exit` | `{ sessionId: string, exitCode: number }` | `start_interactive_pty` | Status tab terminal |
| `agent:session_start` | `{ sessionId: string, agent: string, executable: string, pid: number }` | `spawn_headless_agent` | Tanda proses sudah berjalan (tombol Jeda aktif); Stop/Jeda memakai `sessionId` |
| `agent:token_stream` | `{ sessionId: string, chunk: string }` | `spawn_headless_agent` (1 baris stdout/stderr + `\n`) | `agentStreamParser.ts` → `cli/streamParsers.ts` (NDJSON → `UiAgentEvent`) |
| `agent:session_end` | `{ sessionId: string, exitCode: number, summary: string }` | `spawn_headless_agent` | `useAgentStreamBridge`: tutup bubble & simpan pesan; `useHitlPermissions`: buang antrean izin sesi itu |
| `agent:permission_request` | `{ sessionId: string, requestId: string, toolName: string, input: object }` | `prepare_permission_bridge` (MCP `tools/call` dari CLI) | `useHitlPermissions`: aturan "selalu izinkan" atau Modal HITL 5 opsi → `approve_human_in_the_loop` |

Tidak ada event Tauri lain. Nama lama `agent:thinking_step`, `agent:tool_invoked`, `agent:diff_preview` **tidak dipakai lagi**: parsing terjadi di frontend dan menghasilkan `UiAgentEvent` ([`agent-protocols.md`](./agent-protocols.md) §3). Bila kelak parsing dipindah ke Rust, emit `UiAgentEvent` apa adanya dengan nama `agent:ui_event`.

---

## 7. Utang Teknis yang Diketahui
Selesai (19 Okt 2026): `stop/pause/resume_agent_session` kini memakai `session_id` (peta sesi → proses di
`session_control.rs`); proses headless & PTY diikat ke **Windows Job Object** (SDD bagian 7C); `toggle_skill` memakai satu
registri aplikasi yang persisten.

Masih terbuka:
1. `get_workspaces` masih stub. HITL Chat GUI tersedia untuk kelima agen (agent-protocols §7). Aturan sementara Antigravity bisa tertinggal di settings agy bila aplikasi ditutup paksa di tengah giliran lanjutan (hanya perintah persis yang sudah disetujui).
2. `crates/soraja-core/src/db.rs` (pool SQLite + migrasi dari `database-schema.sql`) belum dipanggil aplikasi; data UI masih disimpan di `localStorage` WebView oleh `desktop-ui/src/services/db.ts` (bukan `%APPDATA%\soraja-ai\soraja.db`).
3. Registri skill belum punya UI dan isinya belum disuntikkan ke CLI agen (`get_skills`/`toggle_skill` belum dipanggil frontend).
4. Anak proses yang dibuat CLI sebelum `AssignProcessToJobObject` (jendela mikrodetik setelah spawn) tidak ikut job.
