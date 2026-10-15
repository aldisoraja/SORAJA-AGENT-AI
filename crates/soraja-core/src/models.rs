use serde::{Deserialize, Serialize};
use specta::Type;

/// Mendefinisikan siklus hidup agen (State Machine).
/// Derivasi `Type` dari Specta akan otomatis mengekspor enum ini ke TypeScript frontend.
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
pub enum AgentState {
    /// Menunggu perintah pengguna
    Idle,
    /// Meminta LLM menghasilkan respon / merancang arsitektur
    Thinking,
    /// Sedang menjalankan perintah terminal / modifikasi file
    ExecutingTool,
    /// Agen dijeda karena perintah terdeteksi destruktif, menunggu izin (HITL)
    AwaitingApproval,
    /// Tugas selesai
    Done,
    /// Proses agen dibatalkan paksa secara manual
    Interrupted,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AgentSession {
    pub id: String,
    pub workspace_id: String,
    pub provider: String,          // agent_id: "antigravity" | "claude" | "codex" | "opencode" | "kiro"
    pub model_name: String,        // e.g., "gemini-3.1-pro"
    pub status: AgentState,
    pub worktree_path: Option<String>,
}

/// Struktur data untuk mem-batch token yang mengalir (streaming) dari LLM
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LlmStreamChunk {
    pub session_id: String,
    pub content: String,
    pub is_reasoning: bool,        // Flag true jika token adalah hasil 'Extended Thinking'
}
