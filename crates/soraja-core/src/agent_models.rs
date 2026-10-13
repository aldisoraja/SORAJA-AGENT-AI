//! Daftar model per agen yang SAMA dengan menu `/model` pada CLI masing-masing (dipisah dari
//! `agent_catalog.rs` agar setiap berkas < 500 baris).
//!
//! Sumber per agen:
//! * `opencode`    → `opencode models` (live)
//! * `antigravity` → `agy models` (live; varian effort dikelompokkan seperti menu `/model`)
//! * `codex`       → `codex debug models` (live; hanya `visibility = "list"`, seperti menu `/model`)
//! * `claude`      → tidak ada perintah daftar model; menu `/model` Claude Code berisi alias tetap.

use crate::agent_catalog::CliModelItem;

fn item(id: &str, name: &str, badge: &str, desc: &str, speed: &str, ctx: Option<&str>) -> CliModelItem {
    CliModelItem {
        id: id.into(),
        name: name.into(),
        badge: Some(badge.into()),
        desc: desc.into(),
        speed: speed.into(),
        context_window: ctx.map(String::from),
        supports_images: None,
    }
}

/// Menjalankan CLI non-interaktif tanpa jendela konsol dan mengembalikan stdout bila sukses.
fn run_cli(target_bin: &str, args: &[&str]) -> Option<String> {
    #[cfg(windows)]
    let output = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let is_shim = target_bin.ends_with(".cmd") || target_bin.ends_with(".bat");
        let mut cmd = if is_shim {
            let mut c = std::process::Command::new("cmd");
            c.args(["/c", target_bin]);
            c
        } else {
            std::process::Command::new(target_bin)
        };
        cmd.args(args).creation_flags(CREATE_NO_WINDOW).output()
    };
    #[cfg(not(windows))]
    let output = std::process::Command::new(target_bin).args(args).output();

    let output = output.ok()?;
    output.status.success().then(|| String::from_utf8_lossy(&output.stdout).to_string())
}

/// Claude Code: isi menu `/model` (Default, Opus, Fable, Sonnet, Haiku).
fn claude_models() -> Vec<CliModelItem> {
    vec![
        item("cli-default", "Default (recommended)", "DEFAULT", "Model bawaan akun Anda di Claude Code", "Native", None),
        item("claude-opus-5-5", "Opus 5.5", "OPUS", "Terbaik untuk tugas kompleks sehari-hari", "Deep", None),
        item("claude-fable-5-1", "Fable 5.1", "FABLE", "Paling mampu untuk tugas tersulit dan terpanjang", "Deep", None),
        item("claude-sonnet-5-5", "Sonnet 5.5", "SONNET", "Efisien untuk tugas rutin", "Fast", None),
        item("claude-haiku-5-5", "Haiku 5.5", "HAIKU", "Tercepat untuk jawaban singkat", "Ultra", None),
    ]
}

/// Codex: model yang tampil di `/model` (`visibility = "list"`), urut berdasarkan `priority`.
fn codex_models(bin: &str) -> Vec<CliModelItem> {
    let Some(text) = run_cli(bin, &["debug", "models"]) else { return Vec::new() };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return Vec::new() };
    let mut rows: Vec<(i64, CliModelItem)> = json["models"]
        .as_array()
        .map(|a| a.as_slice())
        .unwrap_or(&[])
        .iter()
        .filter(|m| m["visibility"].as_str() == Some("list"))
        .filter_map(|m| {
            let slug = m["slug"].as_str()?;
            let ctx = m["context_window"].as_u64().map(|c| format!("{}k", c / 1000));
            Some((
                m["priority"].as_i64().unwrap_or(i64::MAX),
                item(
                    slug,
                    m["display_name"].as_str().unwrap_or(slug),
                    "CODEX",
                    m["description"].as_str().unwrap_or("Model OpenAI Codex"),
                    "Native",
                    ctx.as_deref(),
                ),
            ))
        })
        .collect();
    rows.sort_by_key(|(priority, _)| *priority);
    rows.into_iter().map(|(_, m)| m).collect()
}

/// Antigravity: `agy models` mencetak `<id>\t<nama>` per varian effort. Menu `/model` menampilkan
/// satu baris per model, jadi varian dikelompokkan dan dipilih yang effort-nya tertinggi.
fn antigravity_models(bin: &str) -> Vec<CliModelItem> {
    let Some(text) = run_cli(bin, &["models"]) else { return Vec::new() };
    let rank = |label: &str| match label {
        "High" => 3,
        "Medium" => 2,
        "Low" => 1,
        _ => 0,
    };
    // (nama dasar, rank, id)
    let mut groups: Vec<(String, u8, String)> = Vec::new();
    for line in text.lines() {
        let Some((id, name)) = line.split_once('\t') else { continue };
        let (id, name) = (id.trim(), name.trim());
        if id.is_empty() || name.is_empty() {
            continue;
        }
        let (base, level) = match name.rsplit_once(" (") {
            Some((b, l)) if matches!(l.trim_end_matches(')'), "High" | "Medium" | "Low") => {
                (b.to_string(), rank(l.trim_end_matches(')')))
            }
            _ => (name.to_string(), 0),
        };
        match groups.iter_mut().find(|g| g.0 == base) {
            Some(g) if level > g.1 => *g = (base, level, id.to_string()),
            Some(_) => {}
            None => groups.push((base, level, id.to_string())),
        }
    }
    groups
        .into_iter()
        .map(|(base, _, id)| {
            let lower = base.to_lowercase();
            let badge = if lower.contains("pro") { "PRO" } else if lower.contains("flash") { "FLASH" } else { "AGY" };
            let speed = if badge == "FLASH" { "Ultra" } else { "Native" };
            item(&id, &base, badge, "Model dari menu /model Antigravity CLI", speed, None)
        })
        .collect()
}

/// Judul rapi dari id model OpenCode (`deepseek-v4-flash` → `Deepseek V4 Flash`).
fn opencode_title(model: &str) -> String {
    model
        .split('-')
        .map(|w| {
            let mut c = w.chars();
            c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn opencode_item(line: &str, supports_images: Option<bool>) -> CliModelItem {
    let (provider, model) = line.split_once('/').unwrap_or(("opencode", line));
    let mut it = item(line, &opencode_title(model), &provider.to_uppercase(), &format!("Model live dari opencode ({line})"), "CLI Live", None);
    it.supports_images = supports_images;
    it
}

/// `opencode models --verbose`: baris `<provider>/<model>` diikuti blok JSON metadata
/// (`capabilities.input.image` = dukungan gambar, diverifikasi 13 Okt 2026).
fn parse_opencode_verbose(text: &str) -> Vec<CliModelItem> {
    let mut out = Vec::new();
    let mut current: Option<(String, String)> = None;
    let flush = |cur: Option<(String, String)>, out: &mut Vec<CliModelItem>| {
        if let Some((id, json)) = cur {
            let img = serde_json::from_str::<serde_json::Value>(&json)
                .ok()
                .and_then(|v| v.pointer("/capabilities/input/image").and_then(|b| b.as_bool()));
            out.push(opencode_item(&id, img));
        }
    };
    for line in text.lines() {
        let trimmed = line.trim();
        let is_id = !line.starts_with(char::is_whitespace)
            && trimmed.contains('/')
            && !trimmed.contains(' ')
            && !trimmed.starts_with('{')
            && !trimmed.starts_with('}');
        if is_id {
            flush(current.take(), &mut out);
            current = Some((trimmed.to_string(), String::new()));
        } else if let Some((_, json)) = current.as_mut() {
            json.push_str(line);
            json.push('\n');
        }
    }
    flush(current.take(), &mut out);
    out
}

/// OpenCode: `opencode models --verbose` (dengan kemampuan gambar); fallback `opencode models` (id per baris).
fn opencode_models(bin: &str) -> Vec<CliModelItem> {
    if let Some(text) = run_cli(bin, &["models", "--verbose"]) {
        let parsed = parse_opencode_verbose(&text);
        if !parsed.is_empty() {
            return parsed;
        }
    }
    let Some(text) = run_cli(bin, &["models"]) else { return Vec::new() };
    text.lines()
        .map(str::trim)
        .filter(|l| l.contains('/') && !l.contains(' ') && !l.contains('█') && !l.contains('▄'))
        .map(|line| opencode_item(line, None))
        .collect()
}

/// Katalog model sebuah agen. Kosong bila CLI tidak bisa dijalankan (UI memakai katalog cadangan).
pub fn fetch_live_models_from_cli(agent_id: &str, executable: &str, binary_path: Option<&str>) -> Vec<CliModelItem> {
    let bin = binary_path.unwrap_or(executable);
    match agent_id {
        "claude" => claude_models(),
        "codex" => codex_models(bin),
        "antigravity" => antigravity_models(bin),
        "opencode" => opencode_models(bin),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_opencode_verbose;

    #[test]
    fn opencode_verbose_membaca_dukungan_gambar() {
        let text = "opencode/big-pickle\n{\n  \"id\": \"big-pickle\",\n  \"capabilities\": {\n    \"attachment\": false,\n    \"input\": {\n      \"text\": true,\n      \"image\": false\n    }\n  }\n}\nopencode-go/claude-haiku-5-5\n{\n  \"capabilities\": { \"input\": { \"image\": true } }\n}\nlokal/tanpa-json\n";
        let models = parse_opencode_verbose(text);
        let ids: Vec<_> = models.iter().map(|m| (m.id.as_str(), m.supports_images)).collect();
        assert_eq!(
            ids,
            vec![
                ("opencode/big-pickle", Some(false)),
                ("opencode-go/claude-haiku-5-5", Some(true)),
                ("lokal/tanpa-json", None),
            ]
        );
        assert_eq!(models[1].name, "Claude Haiku 5 5");
    }
}
