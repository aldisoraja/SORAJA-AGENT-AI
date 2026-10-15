use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CliModelItem {
    pub id: String,
    pub name: String,
    pub badge: Option<String>,
    pub desc: String,
    pub speed: String,
    pub context_window: Option<String>,
    /// `Some(false)` = model terbukti tidak menerima gambar (Chat GUI memberi peringatan). `None` = tidak diketahui.
    pub supports_images: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CliAgentProvider {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub executable: String,
    pub icon_name: String,
    pub accent: String,
    pub badge_color: String,
    pub description: String,
    pub is_installed: bool,
    pub binary_path: Option<String>,
    pub default_model_id: String,
    pub models: Vec<CliModelItem>,
}

use std::path::{Path, PathBuf};

pub fn resolve_windows_command(cmd: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    let pathext_var = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
    let extensions: Vec<&str> = pathext_var.split(';').collect();

    let paths = std::env::split_paths(&path_var);
    for dir in paths {
        let full_path = dir.join(cmd);
        if full_path.is_file() {
            return Some(full_path);
        }
        for ext in &extensions {
            let with_ext = dir.join(format!("{}{}", cmd, ext));
            if with_ext.is_file() {
                return Some(with_ext);
            }
        }
    }
    None
}

pub fn resolve_npm_shim_target(shim_path: &Path) -> Option<PathBuf> {
    let ext = shim_path.extension()?.to_string_lossy().to_lowercase();
    if ext != "cmd" && ext != "bat" {
        return None;
    }
    let content = std::fs::read_to_string(shim_path).ok()?;
    // Target shim npm: skrip Node (`codex.js`) atau biner native (`claude.exe`, `opencode.exe`).
    let re = regex::Regex::new(r#""%(?:~)?dp0%?[\\/]([^"]+\.(?:js|exe))""#).ok()?;
    
    if let Some(captures) = re.captures(&content) {
        if let Some(m) = captures.get(1) {
            let relative_path = m.as_str().replace("\\", "/");
            let parent = shim_path.parent()?;
            let resolved = parent.join(relative_path);
            if let Ok(canonical) = std::fs::canonicalize(&resolved) {
                // Return path without UNC prefix if possible, or just as is
                let p_str = canonical.to_string_lossy();
                if p_str.starts_with(r"\\?\") {
                    return Some(PathBuf::from(p_str[4..].to_string()));
                }
                return Some(canonical);
            } else if resolved.exists() {
                return Some(resolved);
            }
        }
    }
    None
}

/// Menyusun (biner, argumen) yang dijalankan langsung tanpa `cmd.exe`.
/// Shim npm `.cmd` dibuka ke targetnya (`.exe` langsung, `.js` lewat `node`) agar argumen
/// multi-baris dan karakter khusus (`" & | % < >`) di prompt sampai utuh ke CLI.
/// Mengembalikan `None` bila shim `.cmd/.bat` tidak bisa dibuka (pemanggil boleh jatuh ke `cmd.exe /c`).
pub fn resolve_cli_launch(bin: &str, args: Vec<String>) -> Option<(String, Vec<String>)> {
    resolve_cli_launch_for(bin, args, cfg!(windows))
}

/// Inti `resolve_cli_launch` dengan platform eksplisit agar cabang Windows bisa diuji di OS mana pun.
fn resolve_cli_launch_for(bin: &str, mut args: Vec<String>, windows: bool) -> Option<(String, Vec<String>)> {
    let mut path = PathBuf::from(bin);
    // `npm/codex` (skrip sh tanpa ekstensi) tidak bisa dijalankan di Windows: pakai shim `.cmd` di sebelahnya.
    if windows && path.extension().is_none() {
        let cmd = path.with_extension("cmd");
        if cmd.is_file() {
            path = cmd;
        }
    }
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if ext != "cmd" && ext != "bat" {
        return Some((path.to_string_lossy().to_string(), args));
    }
    let target = resolve_npm_shim_target(&path)?;
    let target_str = target.to_string_lossy().to_string();
    if target_str.to_lowercase().ends_with(".exe") {
        return Some((target_str, args));
    }
    let node = resolve_windows_command("node")
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "node".to_string());
    args.insert(0, target_str);
    Some((node, args))
}

pub fn detect_cli(exe: &str) -> (bool, Option<String>) {
    #[cfg(windows)]
    {
        if let Some(path) = resolve_windows_command(exe) {
            return (true, Some(path.to_string_lossy().to_string()));
        }
        // Fallback paths on Windows
        if exe == "agy" {
            if let Ok(local) = std::env::var("LOCALAPPDATA") {
                let p = std::path::Path::new(&local).join("agy").join("bin").join("agy.exe");
                if p.exists() {
                    return (true, Some(p.to_string_lossy().to_string()));
                }
            }
        } else if exe == "opencode" {
            if let Ok(pf) = std::env::var("ProgramFiles") {
                let p = std::path::Path::new(&pf).join("nodejs").join("opencode.cmd");
                if p.exists() {
                    return (true, Some(p.to_string_lossy().to_string()));
                }
            }
        } else if exe == "claude" {
            if let Ok(appdata) = std::env::var("APPDATA") {
                let p = std::path::Path::new(&appdata).join("npm").join("claude.cmd");
                if p.exists() {
                    return (true, Some(p.to_string_lossy().to_string()));
                }
            }
        } else if exe == "codex" {
            if let Ok(appdata) = std::env::var("APPDATA") {
                let direct = std::path::Path::new(&appdata)
                    .join("npm")
                    .join("node_modules")
                    .join("@openai")
                    .join("codex")
                    .join("node_modules")
                    .join("@openai")
                    .join("codex-win32-x64")
                    .join("vendor")
                    .join("x86_64-pc-windows-msvc")
                    .join("bin")
                    .join("codex.exe");
                if direct.exists() {
                    return (true, Some(direct.to_string_lossy().to_string()));
                }
                let p = std::path::Path::new(&appdata).join("npm").join("codex.cmd");
                if p.exists() {
                    return (true, Some(p.to_string_lossy().to_string()));
                }
            }
        } else if exe == "kiro-cli" {
            // Installer resmi (terverifikasi di kiro-cli 2.31): %LOCALAPPDATA%\Kiro-Cli\kiro-cli.exe.
            // PATH hasil instalasi baru tidak terbaca proses yang sudah berjalan, jadi cek lokasi langsung.
            let mut candidates: Vec<std::path::PathBuf> = Vec::new();
            if let Ok(local) = std::env::var("LOCALAPPDATA") {
                candidates.push(std::path::Path::new(&local).join("Kiro-Cli").join("kiro-cli.exe"));
            }
            if let Ok(home) = std::env::var("USERPROFILE") {
                candidates.push(std::path::Path::new(&home).join(".kiro").join("bin").join("kiro-cli.exe"));
            }
            if let Some(p) = candidates.into_iter().find(|p| p.exists()) {
                return (true, Some(p.to_string_lossy().to_string()));
            }
        }
        (false, None)
    }
    #[cfg(not(windows))]
    {
        if let Ok(output) = std::process::Command::new("which").arg(exe).output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(first_line) = stdout.lines().next() {
                    let trimmed = first_line.trim().to_string();
                    if !trimmed.is_empty() {
                        return (true, Some(trimmed));
                    }
                }
            }
        }
        (false, None)
    }
}

/// Profil akun dibaca langsung dari berkas milik CLI (lihat `cli_accounts`).
pub use crate::cli_accounts::{get_user_cli_profile, UserCliProfile};
/// Model live dari CLI (lihat `agent_models`).
pub use crate::agent_models::fetch_live_models_from_cli;

/// Metadata statis satu provider; bagian dinamis (instalasi & model) diisi dari CLI.
struct ProviderSpec {
    id: &'static str,
    name: &'static str,
    vendor: &'static str,
    executable: &'static str,
    accent: &'static str,
    badge_color: &'static str,
    description: &'static str,
}

const PROVIDER_SPECS: [ProviderSpec; 5] = [
    ProviderSpec {
        id: "antigravity",
        name: "Antigravity",
        vendor: "Google DeepMind (Autonomous Engine)",
        executable: "agy",
        accent: "from-sky-400 to-indigo-600",
        badge_color: "border-sky-500/30 text-sky-400 bg-sky-950/40",
        description: "Engine Vibe Coding otonom Google Antigravity",
    },
    ProviderSpec {
        id: "claude",
        name: "Claude",
        vendor: "Anthropic",
        executable: "claude",
        accent: "from-amber-500 to-orange-600",
        badge_color: "border-amber-500/30 text-amber-400 bg-amber-950/40",
        description: "Claude Code CLI",
    },
    ProviderSpec {
        id: "codex",
        name: "Codex",
        vendor: "OpenAI",
        executable: "codex",
        accent: "from-emerald-400 to-teal-600",
        badge_color: "border-emerald-500/30 text-emerald-400 bg-emerald-950/40",
        description: "OpenAI Codex CLI",
    },
    ProviderSpec {
        id: "opencode",
        name: "OpenCode",
        vendor: "OpenCode Community (Self-Hosted)",
        executable: "opencode",
        accent: "from-purple-500 to-pink-600",
        badge_color: "border-purple-500/30 text-purple-400 bg-purple-950/40",
        description: "Terminal coding open-source multi-provider dengan puluhan model live",
    },
    ProviderSpec {
        id: "kiro",
        name: "Kiro",
        vendor: "Amazon Web Services",
        executable: "kiro-cli",
        accent: "from-violet-500 to-purple-700",
        badge_color: "border-violet-500/30 text-violet-300 bg-violet-950/40",
        description: "Kiro CLI (AWS): agen spec-driven dengan mode headless",
    },
];

fn build_provider(spec: &ProviderSpec) -> CliAgentProvider {
    let (is_installed, binary_path) = detect_cli(spec.executable);
    let models = fetch_live_models_from_cli(spec.id, spec.executable, binary_path.as_deref());
    provider_from(spec, is_installed, binary_path, models)
}

fn provider_from(
    spec: &ProviderSpec,
    is_installed: bool,
    binary_path: Option<String>,
    models: Vec<CliModelItem>,
) -> CliAgentProvider {
    let default_model_id = models.first().map(|m| m.id.clone()).unwrap_or_default();
    CliAgentProvider {
        id: spec.id.into(),
        name: spec.name.into(),
        vendor: spec.vendor.into(),
        executable: spec.executable.into(),
        icon_name: spec.id.into(),
        accent: spec.accent.into(),
        badge_color: spec.badge_color.into(),
        description: spec.description.into(),
        is_installed,
        binary_path,
        default_model_id,
        models,
    }
}

/// Sumber Kebenaran Tunggal (SSOT) untuk seluruh provider agen.
/// Daftar model dimuat secara dinamis langsung dari CLI masing-masing agen atau katalog live resmi.
/// Keempat CLI dijalankan paralel (urutan hasil tetap sesuai `PROVIDER_SPECS`).
pub fn get_authoritative_agent_providers() -> Vec<CliAgentProvider> {
    std::thread::scope(|scope| {
        let handles: Vec<_> = PROVIDER_SPECS.iter().map(|spec| scope.spawn(move || build_provider(spec))).collect();
        handles.into_iter().filter_map(|h| h.join().ok()).collect()
    })
}

/// Status instalasi keempat agen TANPA menjalankan CLI apa pun (hanya mencari biner di PATH/lokasi bawaan).
/// Cepat (milidetik); `models` dikosongkan. Untuk katalog lengkap gunakan `get_authoritative_agent_providers`.
pub fn get_agent_install_status() -> Vec<CliAgentProvider> {
    PROVIDER_SPECS
        .iter()
        .map(|spec| {
            let (is_installed, binary_path) = detect_cli(spec.executable);
            provider_from(spec, is_installed, binary_path, Vec::new())
        })
        .collect()
}

/// Mendapatkan model-model live langsung dari CLI agen yang dipilih.
pub fn get_agent_models(agent_id: &str) -> Vec<CliModelItem> {
    let (executable, default_exe) = match agent_id {
        "antigravity" => ("agy", "agy"),
        "claude" => ("claude", "claude"),
        "codex" => ("codex", "codex"),
        "opencode" => ("opencode", "opencode"),
        "kiro" | "kiro-cli" => ("kiro-cli", "kiro-cli"),
        _ => return Vec::new(),
    };
    let (_is_installed, binary_path) = detect_cli(executable);
    fetch_live_models_from_cli(agent_id, default_exe, binary_path.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Membuat shim npm palsu + targetnya di folder temp unik.
    fn fake_shim(name: &str, line: &str, target_rel: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("soraja-shim-{}-{}", name, std::process::id()));
        let target = dir.join(target_rel);
        std::fs::create_dir_all(target.parent().unwrap()).unwrap();
        std::fs::write(&target, "").unwrap();
        let shim = dir.join(format!("{}.cmd", name));
        std::fs::write(&shim, format!("@ECHO off\r\nSETLOCAL\r\nCALL :find_dp0\r\n{}\r\n", line)).unwrap();
        shim
    }

    #[test]
    fn shim_exe_dijalankan_langsung_tanpa_cmd() {
        let shim = fake_shim(
            "claude",
            r#""%dp0%\node_modules\@anthropic-ai\claude-code\bin\claude.exe"   %*"#,
            "node_modules/@anthropic-ai/claude-code/bin/claude.exe",
        );
        let prompt = "baris 1\nbaris 2 \"kutip\" & 50% | <x>".to_string();
        let (bin, args) = resolve_cli_launch(&shim.to_string_lossy(), vec!["-p".into(), prompt.clone()]).unwrap();
        assert!(bin.replace('\\', "/").ends_with("claude-code/bin/claude.exe"), "{bin}");
        assert_eq!(args, vec!["-p".to_string(), prompt], "argumen prompt utuh, tanpa cmd.exe");
    }

    #[test]
    fn shim_js_dijalankan_lewat_node() {
        let shim = fake_shim(
            "codex",
            r#"endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\node_modules\@openai\codex\bin\codex.js" %*"#,
            "node_modules/@openai/codex/bin/codex.js",
        );
        let (_bin, args) = resolve_cli_launch(&shim.to_string_lossy(), vec!["exec".into()]).unwrap();
        assert!(args[0].replace('\\', "/").ends_with("codex/bin/codex.js"), "{:?}", args);
        assert_eq!(args[1], "exec");
    }

    #[test]
    fn windows_skrip_tanpa_ekstensi_dialihkan_ke_shim_cmd() {
        // Tata letak npm global di Windows: `codex` (skrip sh), `codex.cmd`, dan target `codex.js`.
        let shim = fake_shim(
            "codexwin",
            r#""%_prog%"  "%dp0%\node_modules\@openai\codex\bin\codex.js" %*"#,
            "node_modules/@openai/codex/bin/codex.js",
        );
        let sh_script = shim.with_extension("");
        std::fs::write(&sh_script, "#!/bin/sh\n").unwrap();
        let sh = sh_script.to_string_lossy().to_string();

        let (_bin, args) = resolve_cli_launch_for(&sh, vec!["exec".into()], true).unwrap();
        assert!(args[0].replace('\\', "/").ends_with("codex/bin/codex.js"), "Windows: lewat node codex.js, {:?}", args);
        // Di Linux/macOS skrip sh dijalankan apa adanya.
        let (bin, args) = resolve_cli_launch_for(&sh, vec!["exec".into()], false).unwrap();
        assert_eq!((bin, args), (sh, vec!["exec".to_string()]));
    }

    #[test]
    fn shim_tak_dikenal_mengembalikan_none_dan_biner_biasa_apa_adanya() {
        let shim = fake_shim("aneh", "echo tidak ada target", "dummy.txt");
        assert!(resolve_cli_launch(&shim.to_string_lossy(), vec![]).is_none());
        let (bin, args) = resolve_cli_launch("/usr/bin/agy.exe", vec!["-p".into()]).unwrap();
        assert_eq!((bin.as_str(), args.len()), ("/usr/bin/agy.exe", 1));
    }

    #[test]
    fn test_authoritative_providers_count_and_ids() {
        let providers = get_authoritative_agent_providers();
        assert_eq!(providers.len(), 5, "Wajib ada 5 agen CLI resmi");
        let ids: Vec<&str> = providers.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, vec!["antigravity", "claude", "codex", "opencode", "kiro"]);
    }

    #[test]
    fn test_invalid_agent_returns_empty() {
        let empty = get_agent_models("non-existent-agent");
        assert!(empty.is_empty());
    }
}
