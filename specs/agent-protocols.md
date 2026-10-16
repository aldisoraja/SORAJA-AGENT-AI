# Agent Protocols — 5 CLI Native ↔ Soraja UI

> Prinsip dasar: **Soraja tidak mengimplementasikan agen sendiri.** Keempat agen adalah biner CLI resmi yang
> sudah terpasang di mesin pengguna. Soraja hanya (1) menjalankan, (2) mengalirkan output, dan (3) menerjemahkan
> output tersebut menjadi UI. Tools (baca/tulis berkas, shell, MCP) adalah milik CLI masing-masing.
> Kontrak IPC terkait: [`ipc-contracts.md`](./ipc-contracts.md).
>
> Implementasi: `desktop-ui/src/services/cli/agentCommands.ts` (argumen), `desktop-ui/src/services/cli/streamParsers.ts`
> (parser), `desktop-ui/src/hooks/useAgentStreamBridge.ts` (event → pesan chat).

## 1. Dua Mode Operasi per Agen

| Mode | Tujuan | IPC | Transport | Tampilan |
| :--- | :--- | :--- | :--- | :--- |
| **Terminal (PTY interaktif)** | Pengalaman 1:1 seperti membuka CLI aslinya (TUI, slash command, login, `/model`, dsb.) | `start_interactive_pty` | ConPTY → `pty:output` (ANSI mentah) | Tab xterm.js (`components/terminal/`) |
| **Chat GUI (headless)** | Pengalaman ala Antigravity Desktop (bubble, trajectory, diff panel) | `spawn_headless_agent` | stdout NDJSON → `agent:token_stream` | `ChatFeed` (`AgentMessage` + `work/AgentWorkTimeline`) + `DiffReviewPanel` |

Kedua mode berbagi **direktori kerja dan sesi CLI**: `cli_session_id` dari mode chat disimpan di percakapan
(`ConversationRecord.cliSessionId`) dan dipakai untuk (a) me-resume pesan berikutnya di chat, dan (b) tombol
**"Buka di Terminal"** yang membuka tab PTY dengan flag resume (§2).

---

## 2. Matriks Perintah per Agen

Biner di-resolve lewat `PATH` + unwrap shim npm (`agent_catalog::detect_cli`, `resolve_npm_shim_target`) — **jangan hardcode path absolut**.
Semua flag diverifikasi dari `--help` dan uji nyata CLI terpasang (12 Okt 2026: codex-cli 0.161.0, opencode, agy, Claude Code).

| Agen (`agent_id`) | Biner | Headless (Chat GUI) | Interaktif (Terminal) | Resume | Model |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `antigravity` | `agy` | `agy -p "<prompt>" --output-format stream-json --add-dir <cwd>` | `agy` | `--conversation <id>` | `--model <id>` | `--effort low\|medium\|high` |
| `claude` | `claude` | `claude -p "<prompt>" --output-format stream-json --verbose` | `claude` | `--resume <session_id>` | `--model <id>` |
| `codex` | `codex` | `codex exec --json --skip-git-repo-check -C <cwd> "<prompt>"` | `codex` | headless: `codex exec resume … <id> "<prompt>"` · terminal: `codex resume <id>` | `-m <id>` |
| `opencode` | `opencode` | `opencode run --format json --dir <cwd> "<prompt>"` | `opencode` | `-s <session_id>` | `-m <provider/model>` |
| `kiro` | `kiro-cli` | `kiro-cli chat --no-interactive --output-format stream-json --agent-engine v3 "<prompt>"` (cwd = proses) | `kiro-cli chat` | `--resume-id <id>` | `--model <id>` |

Baris `kiro` diverifikasi dengan kiro-cli 2.31 terpasang (stream-json v3, `--resume-id sess_…`, `--list-models --format json`; fixture `tests/fixtures/kiro.ndjson`). Dokumentasi kiro-cli 2.x (kiro.dev/docs/cli/headless, kiro.dev/docs/reference/cli-commands), 14 Okt 2026 — dari dokumentasi resmi, BELUM diuji dengan CLI terpasang. Flag Kiro hanya valid di subcommand `chat`. Kiro tidak punya flag system prompt/effort yang dipakai Soraja → aturan bahasa & Chat GUI disisipkan sebagai prefiks prompt headless (seperti Antigravity). Daftar model: `kiro-cli chat --list-models --format json`.

* `--model` tidak dikirim bila model = `cli-default` (CLI memakai konfigurasi pengguna).
* **Effort/penalaran** (keputusan 13 Okt 2026): mode **Chat GUI** sengaja bernalar lebih dalam dari Terminal. Nilai dari
  `AppSettings.chatReasoningEffort` (`high` default · `xhigh` · `max`, Pengaturan → Umum → "Kedalaman penalaran Chat")
  dipetakan per CLI (diverifikasi dari `--help`): `claude --effort <e>`, `agy --effort <e>`,
  `codex -c model_reasoning_effort="<e>"` (`max` → `xhigh`), `opencode --thinking --variant high|max`.
  Mode **Terminal** tidak menerima effort dari Soraja (pengguna mengaturnya lewat slash command CLI).
* **Aturan Chat GUI** (`CHAT_REASONING_RULE`, `services/cli/chatPrompt.ts`): pahami pesan kalimat demi kalimat, baca semua
  lampiran, verifikasi asumsi dengan membaca sumber, laporkan hasil build/tes apa adanya, dan susun jawaban Markdown
  terstruktur. Dikirim lewat `--append-system-prompt` (claude), `developer_instructions` (codex, nilai TOML via
  `JSON.stringify`), atau prefiks prompt (antigravity, opencode). Tidak dipakai di mode Terminal.

### Lampiran Chat GUI (gambar & dokumen)
1. Hingga 10 gambar (paste/drag/unggah) + dokumen. Gambar ≤ 5 MB berformat umum dikirim **tanpa kompresi**; yang lebih
   besar dirender ulang maks. 2560 px (`utils/imageUtils.ts processChatImage`). Riwayat chat hanya menyimpan thumbnail
   720 px (`previewUrl`) + `savedPath` agar kuota localStorage tidak penuh.
2. Sebelum spawn, setiap lampiran disimpan via IPC `save_chat_attachment` → `<proyek>/.soraja/attachments/<id pesan>/NN-nama.ext`.
3. Prompt disusun `buildChatPrompt`: teks pengguna apa adanya + daftar bernomor (`Gambar #1 "nama": <path>`) + instruksi
   wajib membaca semua lampiran. Claude & Antigravity membacanya dengan tool baca berkas (gambar dibaca visual).
   Flag native tambahan: `codex --image=<path>` (setelah `exec`/`resume`), `opencode run --file=<path>` (sebelum `--format`);
   bentuk `=` mencegah opsi variadik menelan argumen prompt.
4. **Model tanpa vision:** OpenCode memuat `capabilities.input.image` dari `opencode models --verbose`
   (`CliModelItem.supportsImages`). Model bernilai `false` (mis. `opencode/big-pickle`) diberi ikon mata dicoret di
   pemilih model, dan kolom input menampilkan peringatan bila gambar dilampirkan.
5. **Uji langsung 13 Okt 2026** (gambar berisi kode + prompt multi-baris ber-`" & | % <>`): claude ✓ (`Read`),
   codex ✓ (`--image=`), antigravity ✓ (`view_file`), opencode ✓ dengan model vision (`mimo-v2.6-flash-free`).
6. **Integritas teks prompt:** shim npm `.cmd` dibuka ke biner aslinya (`agent_catalog::resolve_cli_launch`: `.exe` langsung,
   `.js` via `node`) sehingga prompt multi-baris & karakter `" & | % < >` tidak melewati `cmd.exe`. Prompt berawalan `-`
   diberi spasi di depan agar tidak dibaca sebagai flag.
* `codex exec resume` **tidak** menerima `-C` maupun `--approve-for-me`; direktori kerja diatur oleh `cwd` proses.

### Kebijakan izin (permission) mode headless
Diatur oleh **Pengaturan → Preset Keamanan** (`AppSettings.securityPreset`): `Permissive` = otonom, selainnya = aman.

| Agen | Mode aman (default) | Mode otonom (`Permissive`) | Perilaku mode aman yang terverifikasi |
| :--- | :--- | :--- | :--- |
| `antigravity` | `--mode accept-edits` | `--dangerously-skip-permissions` | Edit berkas jalan; perintah shell **ditolak otomatis** (`result.denied_actions`) → UI menampilkan notice + saran "Buka di Terminal". |
| `claude` | `--permission-mode acceptEdits` | `--permission-mode bypassPermissions` | Edit berkas jalan; shell di luar allow-list pengguna ditolak oleh CLI. |
| `codex` | `--approve-for-me` | `--dangerously-bypass-approvals-and-sandbox` | Permintaan izin ditinjau otomatis oleh Codex. *Catatan: `--sandbox workspace-write` di Windows memblokir bahkan `Set-Content` sehingga tidak dipakai.* |
| `opencode` | tanpa `--auto` | `--auto` | Mengikuti aturan `permission` di config OpenCode pengguna. |
| `kiro` | tanpa flag trust | `--trust-all-tools` | Tanpa trust, Kiro menolak tool yang butuh persetujuan di mode non-interaktif (belum diverifikasi lokal). |

---

## 3. Pemetaan Stream → Event UI

Setiap baris `agent:token_stream.chunk` di-parse sebagai satu objek JSON (NDJSON). Baris non-JSON (log stderr CLI)
menjadi event `log` dan disimpan di `MessageRecord.logs` (tombol "Log CLI" di panel Proses kerja), bukan di jawaban. Keluaran parser:

```ts
type UiAgentEvent =
  | { kind: 'session'; cliSessionId: string; model?: string }      // → ConversationRecord.cliSessionId
  | { kind: 'text'; delta: string }                                 // → isi bubble jawaban
  | { kind: 'thinking'; delta: string }                             // → langkah timeline 'thought' (+ reasoning)
  | { kind: 'tool'; id: string; name: string; input: object; status: 'running' | 'done' | 'error'; output?: string; category?: string } // → trajectory (category = jenis tool ACP Kiro)
  | { kind: 'file_change'; path: string }                           // → git diff → pill "Edited" + DiffReviewPanel (hanya setelah tool edit BERHASIL)
  | { kind: 'denied'; toolId?: string; action?: string }            // → langkah berstatus 'denied' (ditolak mode aman, bukan gagal)
  | { kind: 'usage'; inputTokens: number; outputTokens: number; costUsd?: number }
  | { kind: 'notice'; level: 'info' | 'warn' | 'error'; message: string }
  | { kind: 'log'; line: string }
  | { kind: 'done'; ok: boolean; summary?: string };
```

Field di bawah **sudah diverifikasi** dari output nyata; fixture tes: `desktop-ui/tests/fixtures/*.ndjson`
(diuji oleh `desktop-ui/tests/cliStreamParsers.test.mjs`). Jika versi CLI baru mengubah format, tangkap ulang
fixture dulu sebelum mengubah parser.

Kiro (amplop `{type, data}`, isi ACP), dari dokumentasi resmi — belum ada fixture lokal:

| UiAgentEvent | `kiro` |
| :--- | :--- |
| `session` | `data.sessionId` (event pertama yang memuatnya, mis. `runStarted`/`metadata`) |
| `text` | `sessionUpdate` + `data.update.sessionUpdate="agent_message_chunk"` → `content.text` (fallback `runFinished.data.finalText`) |
| `thinking` | `agent_thought_chunk` → `content.text` (streaming) |
| `tool` | `tool_call` / `tool_call_update` (`toolCallId`, `title`, `kind`, `status` pending/in_progress/completed/failed, `rawInput`, `content[]`/`rawOutput`) |
| `file_change` | `kind="edit"` selesai → `locations[0].path` / `rawInput.path` |
| `usage` | `session_info_update._meta.kiro.promptTurnSummaries[{unit:"credit",usage}]` (sekali per giliran, `kind:"turn_completion"`) → `credits`, token 0; UI menampilkan "N kredit" = pemakaian, BUKAN sisa kuota |
| `done` | `runFinished.data.status="success"` / `runError.data.message` / rekaman interupsi V3 |

| UiAgentEvent | `claude` | `codex` | `opencode` | `antigravity` |
| :--- | :--- | :--- | :--- | :--- |
| `session` | `{type:"system",subtype:"init",session_id}` | `{type:"thread.started",thread_id}` | `sessionID` (event pertama) | `{event:"init",conversation_id}` |
| `text` | `assistant.message.content[].type="text"` | `item.completed` + `item.type="agent_message"` (`item.text`) | `{type:"text",part.text}` | `step_update.step_type="agent_response"` + `text_delta` (fallback `result.response`) |
| `thinking` | content `type="thinking"` | `item.type="reasoning"` | `{type:"reasoning"}` | `step_update.thinking_delta` |
| `tool` | content `tool_use` (running) + `user` `tool_result` (done/error, `is_error`) | `item.type="command_execution"` (`item.started` → `item.completed`, `exit_code`) / `mcp_tool_call` | `{type:"tool_use",part.tool,part.state.status}` | `step_update.step_type="tool"`, `tool_name`, `state` ACTIVE/DONE |
| `file_change` | `tool_use` `Write`/`Edit`/`MultiEdit`/`NotebookEdit` → `input.file_path` | `item.type="file_change"` → `changes[].path` | tool `write`/`edit`/`patch` selesai → `state.input.filePath` | tool `write_to_file`/`replace_file_content`/… → `parameters.TargetFile` |
| `usage` | `result.usage`, `result.total_cost_usd` | `turn.completed.usage` | `step_finish.part.tokens`, `part.cost` | `result.usage` |
| `notice` | — | `{type:"error"}` | `{type:"error"}` | `result.denied_actions[]` |
| `done` | `{type:"result",is_error}` | `turn.completed` / `turn.failed` | (exit proses) | `result.status="SUCCESS"` |

Aturan tambahan (diuji `tests/chatMessageReducer.test.mjs` dengan fixture nyata):
* **Claude:** blok `text` dipisah baris kosong; pesan sub-agen (`parent_tool_use_id`) hanya menyumbang langkah tool, bukan teks
  jawaban; `file_change` dikirim saat `tool_result` sukses (bukan saat `tool_use`); `result.permission_denials[]` → `denied` + notice.
* **Antigravity:** tiap `result.denied_actions[]` → `denied` (per jenis aksi, mis. `command` → langkah perintah terakhir).
* **Penolakan di keluaran tool** (mis. OpenCode `BLOCKED by …`, Claude `requested permissions … haven't granted`) → status `denied`.
* **Rencana kerja:** `TodoWrite` (Claude), `todowrite` (OpenCode), `todo_list` (Codex), `sessionUpdate: plan` (Kiro) → satu langkah
  `plan` yang diperbarui. `web_search` Codex / `WebFetch` / `WebSearch` → langkah `web`.
* Reducer murni event → pesan: `services/cli/messageReducer.ts` (dipakai `useAgentStreamBridge`).

### Diff untuk `DiffReviewPanel`
CLI tidak selalu mengirim isi diff. Untuk setiap `file_change`, UI menjalankan `git diff --no-color -- <path>` via
`run_workspace_terminal` (path relatif diselesaikan terhadap folder proyek). Bila diff kosong, `git status --porcelain --ignored`
menentukan: berkas baru/untracked/diabaikan (`??`, `A`, `!!`) atau folder bukan repo git → isi berkas dibaca dengan
`read_workspace_file` dan seluruhnya ditandai tambahan; berkas ter-track **tanpa perubahan** → tidak ada diff (statistik lama
dibuang). Hanya hasil diff terbaru per berkas yang diterapkan, dan diff yang selesai setelah sesi berakhir tetap disimpan
(`services/cli/fileChangeDiff.ts`).

---

## 4. Autentikasi, Paket & Kuota
Sumber kebenaran akun, paket langganan, dan kuota = **berkas milik CLI** (bukan API key, karena API key tidak memuat info paket). Implementasi: `crates/soraja-core/src/cli_accounts/` (diverifikasi terhadap data asli 12 Okt 2026).

| Agen | Login & paket | Kuota |
| :--- | :--- | :--- |
| `claude` | `~/.claude.json` → `oauthAccount` (email, nama, `organizationType`); `~/.claude/.credentials.json` → **hanya** `subscriptionType` | `~/.claude.json` → `cachedUsageUtilization` (`five_hour`, `seven_day`: `utilization` %, `resets_at`) |
| `codex` | `~/.codex/auth.json` → payload JWT `id_token` (`email`, `chatgpt_plan_type`) | Rollout terbaru `~/.codex/sessions/**.jsonl` → `token_count.rate_limits` (`primary`/`secondary`: `used_percent`, `window_minutes`, `resets_at`) |
| `antigravity` | Keberadaan `~/.gemini/jetski-standalone-oauth-token` (isi tidak dibaca); paket tidak diekspos | Scrape TUI `agy` → `/usage` ("Weekly/Five Hour Limit Remaining … %, Refreshes in …") |
| `opencode` | Nama provider di `~/.local/share/opencode/auth.json` (kunci tidak dibaca) | `opencode stats` (token, biaya, sesi); tidak ada batas kuota |
| `kiro` | `kiro-cli whoami --format json` → `{accountType, provider, email}` (terverifikasi kiro-cli 2.31; biner di `%LOCALAPPDATA%\Kiro-Cli\kiro-cli.exe`). `KIRO_API_KEY` opsional (hanya mengubah `authMethod` menjadi `api_key`) | Tidak diekspos: kredit hanya di TUI `/usage`, `kiro-cli profile` khusus Pro. Kredit per giliran dipetakan ke `AgentUsage.credits` (pemakaian, bukan sisa) |

Jendela kuota yang `resets_at`-nya sudah lewat dianggap reset (0% terpakai). Status "Terhubung" = `isLoggedIn` dari CLI **atau** API key tersimpan.

1. **Default: login bawaan CLI.** Pengguna login di tab Terminal (`claude` → `/login`, `codex login`, `agy` OAuth, `opencode auth login`). Mode headless otomatis memakai sesi login yang sama sehingga kuota langganan tetap berlaku.
2. **Opsional: API key via DPAPI** (modal "Hubungkan" → "Gunakan API key"). Kunci diverifikasi ke endpoint daftar model provider (`services/apiKeyVerifier.ts`) lalu disimpan via `save_account_credential`. Injeksi kunci ke proses CLI (`agentCommands.ts`) **belum diaktifkan** agar tidak menimpa login langganan; aktifkan hanya untuk agen tanpa login CLI.
3. Status "Terhubung" di UI berasal dari `get_user_cli_profile` (login CLI terdeteksi) atau kunci DPAPI.

---

## 5. Aturan Bahasa Jawaban (Bahasa Indonesia)
Keputusan produk: **jawaban agen wajib berbahasa Indonesia** di kedua mode. Teks aturan tunggal:
`LANGUAGE_RULE` di `agentCommands.ts` = konstanta `LANGUAGE_RULE` di `crates/soraja-desktop/src/commands/language_rules.rs`.

| Agen | Mekanisme (terverifikasi) | Mode |
| :--- | :--- | :--- |
| `claude` | `--append-system-prompt "<aturan>"` | Chat & Terminal |
| `codex` | `-c developer_instructions="<aturan>"` | Chat & Terminal |
| `opencode` | env `OPENCODE_CONFIG_CONTENT={"instructions":["<path aturan>"]}`; path dari IPC `prepare_agent_language_rules` (`%APPDATA%\soraja-ai\rules\bahasa-indonesia.md`) | Chat & Terminal |
| `kiro` | Tidak ada flag system prompt yang dipakai: mode Chat menyisipkan `[Instruksi: …]` di awal prompt. Mode Terminal belum memaksa Bahasa Indonesia. | Chat |
| `antigravity` | Tidak ada flag system prompt. IPC `prepare_agent_language_rules` menambahkan **sekali** blok bertanda `<!-- soraja:bahasa-indonesia -->` ke `~/.gemini/antigravity-cli/instructions.md` bila belum ada aturan Bahasa Indonesia; mode Chat juga menyisipkan `[Instruksi: …]` di awal prompt | Chat & Terminal |

**Keputusan: jawaban asli CLI, tanpa lapisan penerjemah.** Isi jawaban dan penalaran agen tidak pernah diterjemahkan,
"dipulihkan", atau disunting oleh Soraja (di Chat GUI maupun Terminal). Bahasa jawaban dijaga hanya oleh aturan di atas
sebagai penjaga: CLI pada umumnya sudah mengikuti bahasa input, dan aturan ini menahan pergeseran ke Bahasa Inggris pada
tugas panjang yang penuh keluaran tool/kode berbahasa Inggris.

Selain itu, **teks UI bawaan CLI** di mode Terminal (prompt izin, "Thinking…", "esc to cancel", dll.) diterjemahkan oleh
`utils/cliTerminalLocalizer.ts` — kecuali OpenCode, karena regex pada stream TUI-nya merusak posisi kursor.
Stream PTY hanya **diterjemahkan** (`localizeTerminalOutput`, lebar tampilan tetap) dan **tidak diwarnai ulang**:
pewarnaan markdown (`beautifyTerminalText`) menyisipkan `ESC[0m` yang mereset latar diff merah/hijau CLI dan
menghapus backtick kode, sehingga dilarang dipakai pada output TUI agen.

Aturan lebar terjemahan (terverifikasi dengan stream PTY nyata kelima CLI, 16 Okt 2026):
* Terjemahan tidak boleh lebih panjang dari aslinya. Label yang bisa **disusul teks di kolom absolut** (agy merender
  diferensial: `Thought for 6s` lalu `ESC[9;17H, 631 tokens`; kotak `Search: [ ]`) wajib **sama lebar persis**.
* Terjemahan yang lebih pendek hanya untuk baris yang digambar utuh (dialog izin, footer pintasan); padding spasi
  diletakkan di **akhir baris visual** (SGR/OSC dilewati), dan dilewati bila akhir baris tidak ada di chunk yang sama.
* Kata umum yang bisa muncul di jawaban/kode agen (`Effort`, `(current)`, `Ran (`) tidak diterjemahkan.

---

## 6. Agent Lifecycle State Machine (per sesi chat)
* `Idle` → `Thinking` (proses spawn, menunggu event pertama)
* `Thinking` ↔ `ExecutingTool` (event `tool` running/done)
* `AwaitingApproval` — CLI meminta izin (lihat §7)
* `Paused` — `pause_agent_session` dipanggil
* `Done` — event `done` / `agent:session_end` dengan `exitCode = 0`
* `Interrupted` — `stop_agent_session` atau `exitCode ≠ 0`

Nilai disimpan di `agent_sessions.status` ([`database-schema.sql`](./database-schema.sql)).

---

## 7. HITL (Human-in-the-Loop) pada CLI Native
* **Mode Terminal:** HITL ditangani 100% oleh prompt izin bawaan CLI (pengguna menjawab langsung di xterm; teks prompt dilokalisasi).
* **Mode Chat GUI:**
  1. *Saat ini:* mode aman (§2) membuat CLI menolak aksi berisiko; penolakan tampil sebagai notice dan pengguna bisa melanjutkan lewat **"Buka di Terminal"**.
  2. *Target:* `claude --permission-prompt-tool <mcp_tool>` → MCP server lokal Soraja memunculkan **Modal HITL 5-Opsi** dan menjawab via `approve_human_in_the_loop`.
* Regex destruktif `TerminalExecutor::is_destructive_command` tetap berlaku untuk `run_workspace_terminal` milik Soraja.

---

## 8. Mesin Fallback / Mode Demo (`agentEngine.ts`)
`generateIntelligentAgentResponse` **bukan** agen sungguhan dan **hanya** dipakai bila:
* CLI agen terpilih `is_installed = false`, atau
* aplikasi berjalan di browser dev server (tanpa Tauri).

Jawaban demo selalu diawali banner *"Mode demo — CLI <agen> belum terpasang …"*. Fallback tidak pernah dijalankan
bersamaan dengan `spawn_headless_agent` untuk prompt yang sama (cabang if/else di `useWorkspaceState.handleSendMessage`).
