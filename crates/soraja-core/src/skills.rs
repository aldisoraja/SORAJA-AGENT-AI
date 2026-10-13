//! Sistem Registri Skill Soraja Core
//! Mengelola katalog skill (SOP prompt & MCP tool guidance) secara modular
//! Mendukung token budgeting, built-in skills, plugin skills, dan workspace custom skills.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Kategori Skill dalam Soraja Engine
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum SkillCategory {
    CoreEngineering,
    WorkflowAutomation,
    SystemSecurity,
    FrontendUi,
    DataResearch,
    CustomWorkspace,
}

impl SkillCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            SkillCategory::CoreEngineering => "Core Engineering",
            SkillCategory::WorkflowAutomation => "Workflow & Automation",
            SkillCategory::SystemSecurity => "System & Security",
            SkillCategory::FrontendUi => "Frontend & Generative UI",
            SkillCategory::DataResearch => "Data & Research",
            SkillCategory::CustomWorkspace => "Workspace Custom",
        }
    }
}

/// Definisi Satu Skill yang Terdaftar
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: SkillCategory,
    pub scope: String, // "Global", "Built-in", "Plugin: science", "Workspace"
    pub token_cost: usize,
    pub is_builtin: bool,
    pub enabled: bool,
    pub instructions: String,
}

/// Manajemen Skill Registry & Token Budgeting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillRegistry {
    pub max_token_budget: usize,
    skills: HashMap<String, SkillDefinition>,
}

impl Default for SkillRegistry {
    fn default() -> Self {
        let mut registry = Self {
            max_token_budget: 20_000,
            skills: HashMap::new(),
        };
        registry.load_default_skills();
        registry
    }
}

impl SkillRegistry {
    pub fn new(max_token_budget: usize) -> Self {
        let mut registry = Self {
            max_token_budget,
            skills: HashMap::new(),
        };
        registry.load_default_skills();
        registry
    }

    /// Mendaftarkan skill default (adaptasi dari builtin skills & core software engineering)
    pub fn load_default_skills(&mut self) {
        // 1. Generative UI (dari Antigravity builtin skills)
        self.register_skill(SkillDefinition {
            id: "generative_ui".into(),
            name: "Generative UI & Interactive Widgets".into(),
            description: "Panduan me-render komponen HTML & Tailwind CSS interaktif langsung di chat atau side-pane.".into(),
            category: SkillCategory::FrontendUi,
            scope: "Built-in".into(),
            token_cost: 320,
            is_builtin: true,
            enabled: true,
            instructions: r#"
# Generative UI Guidelines
- Render custom HTML/Tailwind widgets for rich data visualizations, simulations, or diagrams.
- Always use semantic CSS theme variables (--background, --foreground, --card, --border, --accent).
- For compact widgets (<500px), embed inline in chat cards. For large dashboards, generate standalone artifacts.
"#.trim().into(),
        });

        // 2. Automation & Scheduled Sidecars (dari Antigravity builtin skills)
        self.register_skill(SkillDefinition {
            id: "automation".into(),
            name: "Scheduled Cron Automations".into(),
            description: "Panduan interaktif merancang tugas terjadwal (cron) dan background sidecars otonom.".into(),
            category: SkillCategory::WorkflowAutomation,
            scope: "Built-in".into(),
            token_cost: 280,
            is_builtin: true,
            enabled: true,
            instructions: r#"
# Scheduled Automations
- Guide the user through selecting a cadence: Hourly, Daily, Weekly, or Custom cron expression.
- Persist scheduled tasks in Soraja DB (scheduled_tasks table).
- Execute background workers with isolated SQLite logging.
"#.trim().into(),
        });

        // 3. Permissioned GitHub & Git Guardrails (dari Antigravity builtin skills)
        self.register_skill(SkillDefinition {
            id: "permissioned_github".into(),
            name: "Permissioned GitHub & Git Operations".into(),
            category: SkillCategory::SystemSecurity,
            description: "Interaksi aman dengan GitHub CLI (gh) dan repositori Git dengan izin eksplisit pengguna.".into(),
            scope: "Built-in".into(),
            token_cost: 350,
            is_builtin: true,
            enabled: true,
            instructions: r#"
# GitHub & Git Safety Protocol
- Selalu gunakan `gh` CLI dengan opsi `-R ORG/REPO` untuk repositori resmi.
- Untuk aksi destruktif (force push, branch deletion, release publish), minta konfirmasi HITL (Human-in-the-Loop).
- Gunakan HTTPS untuk kloning dan sinkronisasi remote.
"#.trim().into(),
        });

        // 4. Soraja Customization System (Adaptasi dari agy-customizations)
        self.register_skill(SkillDefinition {
            id: "soraja_customizations".into(),
            name: "Soraja Customization & Rules System".into(),
            category: SkillCategory::WorkflowAutomation,
            description: "Manajemen aturan proyek (.soraja/rules, AGENTS.md), plugin, hooks, dan MCP servers.".into(),
            scope: "Global".into(),
            token_cost: 310,
            is_builtin: true,
            enabled: true,
            instructions: r#"
# Soraja Customizations Guide
- Aturan proyek dibaca secara hierarkis dari `.soraja/rules/`, `AGENTS.md`, dan config global.
- Token budget dipantau (maks 20,000 tokens) agar prompt LLM tidak melebihi konteks efisien.
- Tool MCP didaftarkan melalui `mcp_tools.rs` di Soraja Core.
"#.trim().into(),
        });

        // 5. Soraja Guide (Adaptasi dari antigravity_guide)
        self.register_skill(SkillDefinition {
            id: "soraja_guide".into(),
            name: "Soraja Engine & CLI Guide".into(),
            category: SkillCategory::CoreEngineering,
            description: "Panduan lengkap arsitektur Agent Soraja AI, Tauri Desktop, soraja-cli, dan Rust monorepo.".into(),
            scope: "Global".into(),
            token_cost: 340,
            is_builtin: true,
            enabled: true,
            instructions: r#"
# Soraja Engine Architecture
- `crates/soraja-core`: Mesin bersama (Database SQLite WAL, Git Worktrees, MCP Tools, LLM Adapters).
- `crates/soraja-desktop`: Backend Tauri yang melayani desktop-ui React.
- `crates/soraja-cli`: CLI binary untuk pengembang terminal.
- `desktop-ui`: Frontend React + Vite + Tailwind dengan tema adaptif gelap & terang.
"#.trim().into(),
        });

        // 6. Code Editing & Diff Patching (Skill Inti Rekayasa Perangkat Lunak)
        self.register_skill(SkillDefinition {
            id: "code_editing_and_patching".into(),
            name: "Precision Code Editing & Diff Patching".into(),
            category: SkillCategory::CoreEngineering,
            description: "Standar modifikasi kode modular, pengecekan linter otomatis, dan pencegahan regresi syntax.".into(),
            scope: "Built-in".into(),
            token_cost: 410,
            is_builtin: true,
            enabled: true,
            instructions: r#"
# Precision Code Editing
- Terapkan perubahan kode secara presisi (chunk-based replacement).
- Jangan menghapus komentar atau docstring yang sudah ada kecuali diminta.
- Setelah setiap perubahan kode, jalankan linter atau kompilasi untuk memverifikasi tidak ada error sintaksis.
"#.trim().into(),
        });

        // 7. Terminal Execution & HITL Guardrails (Skill Eksekusi Aman)
        self.register_skill(SkillDefinition {
            id: "terminal_guardrails".into(),
            name: "Terminal Execution & HITL Guardrails".into(),
            category: SkillCategory::SystemSecurity,
            description: "Eksekusi perintah terminal dengan pengamanan Human-in-the-Loop terhadap aksi berbahaya.".into(),
            scope: "Built-in".into(),
            token_cost: 290,
            is_builtin: true,
            enabled: true,
            instructions: r#"
# Terminal Execution Protocol
- Perintah yang mengubah sistem (format, rm -rf, del /s, drop database) WAJIB memicu popup persetujuan pengguna.
- Eksekusi non-destruktif (cargo check, npm test, git status) dapat berjalan secara otomatis di direktori kerja.
"#.trim().into(),
        });

        // 8. Git Worktree Isolation (Skill Isolasi Ruang Kerja)
        self.register_skill(SkillDefinition {
            id: "git_worktree_isolation".into(),
            name: "Git Worktree Branch Isolation".into(),
            category: SkillCategory::CoreEngineering,
            description: "Alokasi worktree sementara terisolasi untuk agen bereksperimen tanpa merusak branch utama.".into(),
            scope: "Built-in".into(),
            token_cost: 260,
            is_builtin: true,
            enabled: true,
            instructions: r#"
# Git Worktree Isolation
- Setiap tugas agen dijalankan dalam branch terpisah `.soraja/worktrees/<session_id>`.
- Jika tugas selesai dan pengguna menekan 'Approve Diff', perubahan di-merge ke branch kerja aktif.
"#.trim().into(),
        });

        // 9. Web Search & Documentation Fetcher
        self.register_skill(SkillDefinition {
            id: "web_search_and_docs".into(),
            name: "Web Search & Online Docs Reader".into(),
            category: SkillCategory::DataResearch,
            description: "Pengambilan dokumentasi online, API crates.io, dan pustaka npm terbaru secara real-time.".into(),
            scope: "Built-in".into(),
            token_cost: 230,
            is_builtin: true,
            enabled: true,
            instructions: r#"
# Web Search & Documentation
- Gunakan pencarian web untuk mencari versi dependensi terbaru dan solusi error rilis terkini.
- Ekstrak hanya teks esensial dari halaman web agar tidak membuang token budget.
"#.trim().into(),
        });

        // 10. Credentials Safety Protocol (Diambil dari plugins/science/credentials)
        self.register_skill(SkillDefinition {
            id: "credentials_protocol".into(),
            name: "Safe Credentials & Secret Vault Protocol".into(),
            category: SkillCategory::SystemSecurity,
            description: "Prosedur verifikasi dan penyimpanan API key / token tanpa membocorkannya ke log atau context prompt.".into(),
            scope: "Built-in".into(),
            token_cost: 160,
            is_builtin: true,
            enabled: true,
            instructions: r#"
# Safe Credentials Protocol
- Jangan pernah mencetak isi plain API token/kunci rahasia ke terminal atau riwayat pesan.
- Selalu verifikasi keberadaan variabel kredensial di DPAPI vault atau file `.env` lokal tanpa mencetak nilainya.
- Jika kredensial belum ada, arahkan pengguna ke menu Settings / Kredensial Model.
"#.trim().into(),
        });

        // 11. Workflow-to-Skill Creator (Diambil dari plugins/science/workflow_skill_creator)
        self.register_skill(SkillDefinition {
            id: "workflow_skill_creator".into(),
            name: "Workflow-to-Skill Distiller".into(),
            category: SkillCategory::WorkflowAutomation,
            description: "Menyaring alur kerja coding interaktif yang berhasil menjadi file SKILL.md reusable di .soraja/skills/.".into(),
            scope: "Built-in".into(),
            token_cost: 270,
            is_builtin: true,
            enabled: true,
            instructions: r#"
# Workflow-to-Skill Distiller
- Mengekstrak pola dan langkah dari interaksi coding yang telah terbukti berhasil.
- Merangkum SOP ke dalam format Markdown dengan frontmatter YAML (`name`, `description`).
- Menyimpan skill baru ke direktori `.soraja/skills/<nama>/SKILL.md`.
"#.trim().into(),
        });

        // 12. UV Python Environment Runner (Diambil dari plugins/science/uv)
        self.register_skill(SkillDefinition {
            id: "uv_python_runner".into(),
            name: "Fast Python & UV Environment Runner".into(),
            category: SkillCategory::CoreEngineering,
            description: "Manajemen dan eksekusi skrip Python kilat menggunakan package manager modern Astral uv.".into(),
            scope: "Built-in".into(),
            token_cost: 140,
            is_builtin: true,
            enabled: true,
            instructions: r#"
# Fast Python Environment with UV
- Pastikan ketersediaan `uv` untuk eksekusi skrip otomasi Python cepat tanpa merusak global environment.
- Jalankan via `uv run` atau alokasikan virtualenv terisolasi di direktori project.
"#.trim().into(),
        });
    }

    /// Mendaftarkan skill baru
    pub fn register_skill(&mut self, skill: SkillDefinition) {
        self.skills.insert(skill.id.clone(), skill);
    }

    /// Mengaktifkan atau menonaktifkan skill
    pub fn set_skill_enabled(&mut self, skill_id: &str, enabled: bool) -> bool {
        if let Some(skill) = self.skills.get_mut(skill_id) {
            skill.enabled = enabled;
            true
        } else {
            false
        }
    }

    /// Mengambil semua skill
    pub fn get_all_skills(&self) -> Vec<&SkillDefinition> {
        let mut list: Vec<&SkillDefinition> = self.skills.values().collect();
        list.sort_by(|a, b| a.id.cmp(&b.id));
        list
    }

    /// Mengambil skill aktif saja
    pub fn get_active_skills(&self) -> Vec<&SkillDefinition> {
        self.skills.values().filter(|s| s.enabled).collect()
    }

    /// Menghitung total token yang digunakan oleh skill aktif
    pub fn calculate_used_tokens(&self) -> usize {
        self.skills
            .values()
            .filter(|s| s.enabled)
            .map(|s| s.token_cost)
            .sum()
    }

    /// Menghitung persentase penggunaan token budget
    pub fn calculate_budget_percentage(&self) -> f32 {
        if self.max_token_budget == 0 {
            return 0.0;
        }
        (self.calculate_used_tokens() as f32 / self.max_token_budget as f32) * 100.0
    }

    /// Menghasilkan format prompt sistem yang menginjeksi instruksi skill aktif ke LLM
    pub fn build_system_prompt_injection(&self) -> String {
        let mut prompt = String::from("## SORAJA REGISTERED SKILLS & OPERATING PROCEDURES\n\n");
        for skill in self.get_active_skills() {
            prompt.push_str(&format!(
                "### Skill: {} (`{}`)\n*Scope: {} | Category: {}*\n{}\n\n",
                skill.name,
                skill.id,
                skill.scope,
                skill.category.as_str(),
                skill.instructions
            ));
        }
        prompt
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_skills_loaded() {
        let registry = SkillRegistry::default();
        let skills = registry.get_all_skills();
        assert!(skills.len() >= 9, "Harus memuat minimal 9 skill default");
        assert!(registry.calculate_used_tokens() > 0);
        assert!(registry.calculate_budget_percentage() < 100.0);
    }

    #[test]
    fn test_toggle_skill() {
        let mut registry = SkillRegistry::default();
        let initial_tokens = registry.calculate_used_tokens();
        
        // Nonaktifkan generative_ui
        assert!(registry.set_skill_enabled("generative_ui", false));
        assert!(registry.calculate_used_tokens() < initial_tokens);

        // Aktifkan kembali
        assert!(registry.set_skill_enabled("generative_ui", true));
        assert_eq!(registry.calculate_used_tokens(), initial_tokens);
    }
}
