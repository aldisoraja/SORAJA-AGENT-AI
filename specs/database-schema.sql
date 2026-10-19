-- Agent Soraja AI Database Schema (v1.2)
-- Referensi migrasi rusqlite di `crates/soraja-core/src/db.rs`.
-- Lokasi fisik: %APPDATA%\soraja-ai\soraja.db (+ soraja.db-wal, soraja.db-shm)
--
-- Peta istilah UI ↔ tabel:
--   "Proyek / Workspace"  = workspaces
--   "Percakapan (chat)"   = agent_sessions   (UI: ConversationRecord)
--   "Pesan"               = execution_logs   (UI: MessageRecord)
--   "Tab Terminal CLI"    = pty_sessions
--
-- Nilai agent_id yang SAH (5 agen CLI native, lihat specs/agent-protocols.md):
--   'antigravity' | 'claude' | 'codex' | 'opencode' | 'kiro'

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- 1. Workspaces (folder proyek pengguna)
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    branch TEXT,
    color TEXT,
    is_pinned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Accounts (metadata koneksi per agen; secret TIDAK disimpan di sini)
-- auth_mode 'cli_login'  : memakai login bawaan CLI (default)
-- auth_mode 'api_key'    : kunci di Windows Credential Manager (DPAPI), service = 'soraja-ai', user = agent_id
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL UNIQUE
        CHECK (agent_id IN ('antigravity', 'claude', 'codex', 'opencode', 'kiro')),
    auth_mode TEXT NOT NULL DEFAULT 'cli_login'
        CHECK (auth_mode IN ('cli_login', 'api_key')),
    account_email TEXT,
    tier_status TEXT,                -- 'free', 'pro', 'max', 'plus', 'ultra', 'lokal'
    is_active INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Agent Sessions (satu percakapan chat GUI = satu sesi CLI headless)
CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,             -- sessionId Soraja (UUID, dipakai di event IPC)
    workspace_id TEXT NOT NULL,
    title TEXT,
    agent_id TEXT NOT NULL
        CHECK (agent_id IN ('antigravity', 'claude', 'codex', 'opencode', 'kiro')),
    model_name TEXT NOT NULL,        -- id model dari get_agent_models, atau 'cli-default'
    thinking_budget TEXT,            -- nilai effort/variant yang dikirim ke CLI (mis. 'low', 'medium', 'high')
    permission_mode TEXT DEFAULT 'safe'
        CHECK (permission_mode IN ('safe', 'autonomous')),
    cli_session_id TEXT,             -- id sesi milik CLI (claude session_id, codex thread_id, opencode sessionID, agy conversation id) untuk resume
    worktree_path TEXT,              -- opsional: .soraja/worktrees/agent-<id>
    last_pid INTEGER,                -- PID proses headless terakhir (untuk stop/pause)
    status TEXT DEFAULT 'idle'
        CHECK (status IN ('idle', 'thinking', 'executing_tool', 'awaiting_approval', 'paused', 'done', 'interrupted')),
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cost_usd REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_workspace ON agent_sessions(workspace_id);

-- 4. Execution Logs (pesan chat & jejak tool)
CREATE TABLE IF NOT EXISTS execution_logs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL
        CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT,                    -- teks markdown
    thinking_content TEXT,           -- reasoning / CoT
    tool_calls_json TEXT,            -- array UiAgentEvent{kind:'tool'|'file_change'} (lihat agent-protocols.md §3)
    attachments_json TEXT,           -- lampiran (gambar/PDF/dokumen)
    raw_event_json TEXT,             -- opsional: baris NDJSON asli dari CLI untuk debug
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_execution_logs_session ON execution_logs(session_id, created_at);

-- 5. PTY Sessions (tab Terminal CLI interaktif)
-- Output ANSI TIDAK disimpan (volatil); hanya metadata agar tab bisa dipulihkan/di-resume.
CREATE TABLE IF NOT EXISTS pty_sessions (
    id TEXT PRIMARY KEY,             -- sessionId untuk start_interactive_pty
    workspace_id TEXT NOT NULL,
    agent_id TEXT NOT NULL
        CHECK (agent_id IN ('antigravity', 'claude', 'codex', 'opencode', 'kiro', 'shell')),
    agent_session_id TEXT,           -- jika tab dibuka dari percakapan chat ("Buka di Terminal")
    cli_session_id TEXT,             -- id sesi CLI yang di-resume
    args_json TEXT,                  -- argumen yang dipakai saat spawn
    cwd TEXT NOT NULL,
    cols INTEGER DEFAULT 100,
    rows INTEGER DEFAULT 24,
    status TEXT DEFAULT 'running'
        CHECK (status IN ('running', 'exited', 'closed')),
    exit_code INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY(agent_session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_pty_sessions_workspace ON pty_sessions(workspace_id);

-- 6. HITL Permission Rules (opsi 2–4 dari Modal HITL 5-Opsi)
CREATE TABLE IF NOT EXISTS permission_rules (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL
        CHECK (scope IN ('conversation', 'project', 'global')),
    scope_ref TEXT,                  -- agent_sessions.id / workspaces.id / NULL untuk global
    pattern TEXT NOT NULL,           -- pola perintah atau nama tool yang diizinkan
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. App Settings (key-value)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
