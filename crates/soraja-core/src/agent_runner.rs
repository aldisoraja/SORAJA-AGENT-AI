use anyhow::Result;
use tokio::sync::mpsc;

use crate::models::{AgentSession, AgentState, LlmStreamChunk};
use crate::git_worktree::GitWorktreeManager;
use crate::mcp_tools::TerminalExecutor;
use crate::llm_adapters::gemini::GeminiAdapter;

/// Orkestrator pusat yang mengatur siklus hidup Agen (ReAct Loop)
pub struct AgentRunner {
    pub session: AgentSession,
    pub worktree_manager: GitWorktreeManager,
}

impl AgentRunner {
    pub fn new(session: AgentSession, repo_path: &str) -> Self {
        Self {
            session,
            worktree_manager: GitWorktreeManager::new(repo_path),
        }
    }

    /// Menjalankan siklus agen secara asinkron.
    /// Mengembalikan sebuah Receiver (Channel) yang akan memancarkan token ke UI secara real-time.
    pub async fn run(&mut self, prompt: &str) -> Result<mpsc::Receiver<LlmStreamChunk>> {
        // 1. Siapkan lingkungan isolasi (Git Worktree)
        let worktree_path = self.worktree_manager
            .setup_isolated_environment(&self.session.id)?;
            
        self.session.worktree_path = Some(worktree_path.clone());
        self.session.status = AgentState::Thinking;

        // 2. Siapkan channel streaming antar-thread (buffer: 100 frame/token)
        let (tx, rx) = mpsc::channel::<LlmStreamChunk>(100);

        // Siapkan variabel untuk dilempar ke thread background (Tokio)
        let session_id = self.session.id.clone();
        let user_prompt = prompt.to_string();
        let executor = TerminalExecutor::new(&worktree_path);
        
        // TODO: Baca Kredensial dari `auth::get_token()`
        let _adapter = GeminiAdapter::new("API_KEY_SECURE".to_string(), self.session.model_name.clone());

        // 3. Jalankan LLM Inference & Eksekusi di Background Thread (Non-Blocking)
        tokio::spawn(async move {
            
            // Mengirim token awal (simulasi Reasoning)
            let _ = tx.send(LlmStreamChunk {
                session_id: session_id.clone(),
                content: format!("Agen mulai memproses instruksi: {}\n", user_prompt),
                is_reasoning: true,
            }).await;

            // --- Simulasi Keamanan Terminal (Guardrails HITL) ---
            // Di implementasi penuh, LLM akan mengembalikan JSON untuk memicu tool ini.
            let cmd_from_llm = "echo 'Menjalankan setup dependensi...'"; 
            
            if TerminalExecutor::is_destructive_command(cmd_from_llm) {
                // Hentikan eksekusi dan kabari Frontend bahwa agen butuh persetujuan manusia
                let _ = tx.send(LlmStreamChunk {
                    session_id: session_id.clone(),
                    content: "\n[SISTEM]: Perintah destruktif terdeteksi. Menunggu persetujuan pengguna...\n".to_string(),
                    is_reasoning: false,
                }).await;
            } else {
                // Eksekusi terminal dengan aman di dalam Worktree
                match executor.run_command(cmd_from_llm).await {
                    Ok(output) => {
                        let _ = tx.send(LlmStreamChunk {
                            session_id,
                            content: format!("\n[Terminal Output]:\n{}\n", output),
                            is_reasoning: false,
                        }).await;
                    },
                    Err(e) => {
                        let _ = tx.send(LlmStreamChunk {
                            session_id,
                            content: format!("\n[Terminal Error]: {}\n", e),
                            is_reasoning: false,
                        }).await;
                    }
                }
            }
        });

        // Kembalikan receiver-nya agar Tauri IPC bisa me-listen stream tokennya
        Ok(rx)
    }
}
