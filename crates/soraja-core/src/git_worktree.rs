use anyhow::{Context, Result};
use git2::{Repository, WorktreeAddOptions};
use std::path::{Path, PathBuf};
use std::fs;

/// Manajer Git Worktree untuk memberikan ruang kerja terisolasi bagi agen
pub struct GitWorktreeManager {
    repo_path: PathBuf,
}

impl GitWorktreeManager {
    pub fn new<P: AsRef<Path>>(repo_path: P) -> Self {
        Self {
            repo_path: repo_path.as_ref().to_path_buf(),
        }
    }

    /// Membuat branch baru dari HEAD dan menyambungkannya ke Git Worktree fisik.
    /// Mengembalikan absolute path menuju folder worktree tersebut.
    pub fn setup_isolated_environment(&self, session_id: &str) -> Result<String> {
        let repo = Repository::open(&self.repo_path)
            .context("Gagal membuka repositori Git utama")?;
            
        let branch_name = format!("soraja-agent-{}", session_id);
        let worktree_name = format!("agent-{}", session_id);
        
        // Target folder isolasi: <REPO_ROOT>/.soraja/worktrees/agent-<ID>
        let worktree_path = self.repo_path
            .join(".soraja")
            .join("worktrees")
            .join(&worktree_name);
            
        // Ambil commit terbaru di branch saat ini (HEAD)
        let head = repo.head()?.peel_to_commit()?;
        
        // Buat branch isolasi baru khusus untuk agen ini
        let branch = repo.branch(&branch_name, &head, false)
            .context("Gagal membuat branch git untuk agen")?;
            
        // Konfigurasi pembuatan Worktree
        let mut opts = WorktreeAddOptions::new();
        opts.reference(Some(branch.get()));
        
        // Eksekusi pembuatan Worktree
        let _worktree = repo.worktree(&worktree_name, &worktree_path, Some(&opts))
            .context("Gagal melampirkan folder ke Git Worktree")?;
            
        Ok(worktree_path.to_string_lossy().to_string())
    }
    
    /// Menghapus folder worktree fisik secara paksa jika sesi dibatalkan
    pub fn cleanup_environment(&self, session_id: &str) -> Result<()> {
        let worktree_name = format!("agent-{}", session_id);
        let worktree_path = self.repo_path
            .join(".soraja")
            .join("worktrees")
            .join(&worktree_name);
            
        if worktree_path.exists() {
            // Hapus direktori kerja agen dari filesystem
            fs::remove_dir_all(&worktree_path)?;
            
            // Catatan: Referensi worktree di internal Git (`git worktree prune`) 
            // harus dijalankan berkala oleh sistem pemeliharaan.
        }
        
        Ok(())
    }
}
