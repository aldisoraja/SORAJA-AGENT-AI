use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::path::Path;
use anyhow::Result;

/// Tipe alias untuk Connection Pool SQLite
pub type DbPool = Pool<SqliteConnectionManager>;

/// Menginisialisasi database SQLite dengan Connection Pooling
/// Mengaktifkan fitur Write-Ahead Logging (WAL) untuk menghindari 
/// `database is locked` error saat agen membaca/menulis paralel.
pub fn init_pool<P: AsRef<Path>>(db_path: P) -> Result<DbPool> {
    let manager = SqliteConnectionManager::file(db_path)
        .with_init(|c: &mut Connection| {
            // WAL mode & optimasi konkurensi tinggi.
            // PRAGMA yang mengembalikan baris (journal_mode) dibaca via query_row agar aman di semua fitur rusqlite.
            c.query_row("PRAGMA journal_mode = WAL", [], |_| Ok(()))?;
            c.execute_batch(
                "PRAGMA synchronous = NORMAL;
                 PRAGMA temp_store = MEMORY;
                 PRAGMA foreign_keys = ON;",
            )?;
            // Tunggu max 5 detik jika ada bentrokan lock ringan
            c.busy_timeout(std::time::Duration::from_secs(5))
        });
        
    // Membangun pool dengan maksimal 10 koneksi konkuren
    let pool = Pool::builder()
        .max_size(10)
        .build(manager)?;
        
    // Jalankan migrasi tabel secara otomatis
    run_migrations(&pool)?;
        
    Ok(pool)
}

/// DDL resmi (single source of truth) dari `specs/database-schema.sql`.
const SCHEMA_SQL: &str = include_str!("../../../specs/database-schema.sql");

/// DDL tanpa baris PRAGMA (PRAGMA koneksi sudah diatur di `init_pool`).
fn schema_ddl() -> String {
    SCHEMA_SQL
        .lines()
        .filter(|l| !l.trim_start().to_uppercase().starts_with("PRAGMA"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Kolom yang ditambahkan sejak skema v1.1 untuk meng-upgrade database lama secara aman.
/// (ALTER TABLE ADD COLUMN tidak mendukung default non-konstan, jadi timestamp dibiarkan NULL.)
const LEGACY_COLUMNS: &[(&str, &str, &str)] = &[
    ("workspaces", "branch", "TEXT"),
    ("workspaces", "color", "TEXT"),
    ("workspaces", "is_pinned", "INTEGER DEFAULT 0"),
    ("workspaces", "updated_at", "DATETIME"),
    ("accounts", "agent_id", "TEXT"),
    ("accounts", "auth_mode", "TEXT NOT NULL DEFAULT 'cli_login'"),
    ("agent_sessions", "agent_id", "TEXT"),
    ("agent_sessions", "permission_mode", "TEXT DEFAULT 'safe'"),
    ("agent_sessions", "cli_session_id", "TEXT"),
    ("agent_sessions", "last_pid", "INTEGER"),
    ("agent_sessions", "total_input_tokens", "INTEGER DEFAULT 0"),
    ("agent_sessions", "total_output_tokens", "INTEGER DEFAULT 0"),
    ("agent_sessions", "total_cost_usd", "REAL"),
    ("agent_sessions", "updated_at", "DATETIME"),
    ("execution_logs", "attachments_json", "TEXT"),
    ("execution_logs", "raw_event_json", "TEXT"),
];

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let names = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for name in names {
        if name? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Memetakan nilai `provider` lama (v1.1) ke `agent_id` 4 agen CLI native.
const LEGACY_PROVIDER_MAP: &str = "CASE lower(provider)
    WHEN 'gemini' THEN 'antigravity' WHEN 'google' THEN 'antigravity' WHEN 'agy' THEN 'antigravity'
    WHEN 'anthropic' THEN 'claude' WHEN 'openai' THEN 'codex' WHEN 'deepseek' THEN 'opencode'
    ELSE lower(provider) END";

fn upgrade_legacy_tables(conn: &Connection) -> Result<()> {
    for (table, column, decl) in LEGACY_COLUMNS {
        if !column_exists(conn, table, column)? {
            conn.execute_batch(&format!("ALTER TABLE {} ADD COLUMN {} {};", table, column, decl))?;
        }
    }
    for table in ["accounts", "agent_sessions"] {
        if column_exists(conn, table, "provider")? {
            conn.execute_batch(&format!(
                "UPDATE {} SET agent_id = {} WHERE agent_id IS NULL;",
                table, LEGACY_PROVIDER_MAP
            ))?;
        }
    }
    Ok(())
}

/// Menjalankan DDL skema database (sesuai specs/database-schema.sql) + upgrade tabel lama.
pub fn run_migrations(pool: &DbPool) -> Result<()> {
    let conn = pool.get()?;
    conn.execute_batch(&schema_ddl())?;
    upgrade_legacy_tables(&conn)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrasi_skema_baru_berhasil() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(&schema_ddl()).unwrap();
        upgrade_legacy_tables(&conn).unwrap();
        assert!(column_exists(&conn, "agent_sessions", "cli_session_id").unwrap());
        assert!(column_exists(&conn, "pty_sessions", "cwd").unwrap());
    }

    #[test]
    fn upgrade_database_v1_1() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
             CREATE TABLE accounts (id TEXT PRIMARY KEY, provider TEXT NOT NULL, account_email TEXT, tier_status TEXT, is_active INTEGER DEFAULT 1, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
             CREATE TABLE agent_sessions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT, provider TEXT NOT NULL, model_name TEXT NOT NULL, thinking_budget TEXT, worktree_path TEXT, status TEXT DEFAULT 'idle', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
             CREATE TABLE execution_logs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, thinking_content TEXT, tool_calls_json TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
             INSERT INTO workspaces (id, name, path) VALUES ('w1', 'Demo', 'D:/demo');
             INSERT INTO agent_sessions (id, workspace_id, provider, model_name) VALUES ('s1', 'w1', 'anthropic', 'm');",
        )
        .unwrap();
        conn.execute_batch(&schema_ddl()).unwrap();
        upgrade_legacy_tables(&conn).unwrap();
        let agent: String = conn
            .query_row("SELECT agent_id FROM agent_sessions WHERE id = 's1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(agent, "claude");
    }
}
