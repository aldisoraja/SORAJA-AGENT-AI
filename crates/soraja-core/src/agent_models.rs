//! Daftar model per agen yang SAMA dengan menu `/model` pada CLI masing-masing (dipisah dari
//! `agent_catalog.rs` agar setiap berkas < 500 baris).
//!
//! Sumber per agen:
//! * `opencode`    → `opencode models` (live)
//! * `antigravity` → `agy models` (live; varian effort dikelompokkan seperti menu `/model`)
//! * `codex`       → `codex debug models` (live; hanya `visibility = "list"`, seperti menu `/model`)
//! * `claude`      → tidak ada perintah daftar model; menu `/model` Claude Code berisi alias tetap.

use crate::agent_catalog::CliModelItem;
use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

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

/// Batas waktu satu perintah CLI; CLI yang menggantung tidak boleh menahan UI tanpa akhir.
const CLI_TIMEOUT: Duration = Duration::from_secs(10);
/// Katalog model jarang berubah; hasil tidak kosong disimpan sebentar agar tidak menjalankan CLI berulang.
const MODEL_CACHE_TTL: Duration = Duration::from_secs(30 * 60);

type ModelCacheEntry = (String, Instant, Vec<CliModelItem>);
static MODEL_CACHE: Mutex<Vec<ModelCacheEntry>> = Mutex::new(Vec::new());

/// Menjalankan CLI non-interaktif tanpa jendela konsol dan mengembalikan stdout bila sukses
/// dalam `CLI_TIMEOUT`. Bila lewat batas, proses dihentikan dan hasilnya `None`.
pub(crate) fn run_cli(target_bin: &str, args: &[&str]) -> Option<String> {
    #[cfg(windows)]
    let mut cmd = {
        let is_shim = target_bin.ends_with(".cmd") || target_bin.ends_with(".bat");
        if is_shim {
            let mut c = Command::new("cmd");
            c.args(["/c", target_bin]);
            c
        } else {
            Command::new(target_bin)
        }
    };
    #[cfg(not(windows))]
    let mut cmd = Command::new(target_bin);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // Probe latar belakang tidak boleh merebut CPU dari UI & terminal yang sedang dipakai.
        const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;
        cmd.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS);
    }

    let mut child = cmd
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    // Pipa dibaca di thread terpisah supaya output besar tidak membuat proses macet menunggu.
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        buf
    });

    let deadline = Instant::now() + CLI_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    let bytes = reader.join().ok()?;
    status.success().then(|| String::from_utf8_lossy(&bytes).to_string())
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

/// Kiro: `kiro-cli chat --list-models --format json`. Format nyata (kiro-cli 2.31):
/// `{"models":[{"model_name","model_id","description","context_window_tokens","rate_multiplier","rate_unit"}]}`.
/// Bentuk lain (array langsung, item string, `id/modelId/name`) tetap ditoleransi. Diawali opsi bawaan akun.
fn kiro_models(bin: &str) -> Vec<CliModelItem> {
    let mut models = vec![item("cli-default", "Default (Kiro)", "DEFAULT", "Model bawaan/konfigurasi Kiro CLI", "Native", None)];
    if let Some(text) = run_cli(bin, &["chat", "--list-models", "--format", "json"]) {
        models.extend(parse_kiro_models(&text));
    }
    models
}

pub(crate) fn parse_kiro_models(text: &str) -> Vec<CliModelItem> {
    let Ok(json) = serde_json::from_str::<serde_json::Value>(text.trim()) else { return Vec::new() };
    let list = json.as_array().cloned().or_else(|| json["models"].as_array().cloned()).unwrap_or_default();
    list.iter()
        .filter_map(|m| {
            let id = m.as_str().map(String::from).or_else(|| {
                ["model_id", "modelId", "id", "model_name", "name"].iter().find_map(|k| m[*k].as_str().map(String::from))
            })?;
            let name = ["model_name", "name", "displayName"].iter().find_map(|k| m[*k].as_str()).unwrap_or(&id).to_string();
            let mut desc = m["description"].as_str().unwrap_or("Model dari daftar `--list-models` Kiro CLI").to_string();
            if let Some(rate) = m["rate_multiplier"].as_f64() {
                let unit = m["rate_unit"].as_str().unwrap_or("Credit");
                desc = format!("{desc} · {rate}x {unit}");
            }
            let ctx = ["context_window_tokens", "contextWindow", "context_window"].iter().find_map(|k| m[*k].as_u64()).map(|n| n.to_string());
            Some(item(&id, &name, "KIRO", &desc, "Native", ctx.as_deref()))
        })
        .collect()
}

fn fetch_models_uncached(agent_id: &str, bin: &str) -> Vec<CliModelItem> {
    match agent_id {
        "claude" => claude_models(),
        "codex" => codex_models(bin),
        "antigravity" => antigravity_models(bin),
        "opencode" => opencode_models(bin),
        "kiro" | "kiro-cli" => kiro_models(bin),
        _ => Vec::new(),
    }
}

/// Katalog model sebuah agen (di-cache `MODEL_CACHE_TTL`). Kosong bila CLI tidak bisa dijalankan
/// (UI memakai katalog cadangan). Kunci cache tidak dipegang saat CLI berjalan.
pub fn fetch_live_models_from_cli(agent_id: &str, executable: &str, binary_path: Option<&str>) -> Vec<CliModelItem> {
    if let Ok(cache) = MODEL_CACHE.lock() {
        if let Some((_, at, models)) = cache.iter().find(|(id, _, _)| id == agent_id) {
            if at.elapsed() < MODEL_CACHE_TTL {
                return models.clone();
            }
        }
    }
    let models = fetch_models_uncached(agent_id, binary_path.unwrap_or(executable));
    if !models.is_empty() {
        if let Ok(mut cache) = MODEL_CACHE.lock() {
            cache.retain(|(id, _, _)| id != agent_id);
            cache.push((agent_id.to_string(), Instant::now(), models.clone()));
        }
    }
    models
}

#[cfg(test)]
mod tests {
    use super::{parse_kiro_models, parse_opencode_verbose};

    #[test]
    fn kiro_list_models_toleran_bentuk_json() {
        let a = parse_kiro_models(r#"{"models":[{"id":"claude-sonnet-5-5","name":"Claude Sonnet 5.5","contextWindow":200000},"auto"]}"#);
        let ids: Vec<_> = a.iter().map(|m| (m.id.as_str(), m.context_window.as_deref())).collect();
        assert_eq!(ids, vec![("claude-sonnet-5-5", Some("200000")), ("auto", None)]);
        // Format nyata dari kiro-cli 2.31
        let real = parse_kiro_models(
            r#"{"models":[{"model_name":"claude-haiku-4.5","description":"The latest Claude Haiku model","model_id":"claude-haiku-4.5","context_window_tokens":200000,"rate_multiplier":0.4,"rate_unit":"Credit"}]}"#,
        );
        assert_eq!(real[0].id, "claude-haiku-4.5");
        assert_eq!(real[0].context_window.as_deref(), Some("200000"));
        assert!(real[0].desc.contains("0.4x Credit"), "{}", real[0].desc);
        let b = parse_kiro_models(r#"[{"modelId":"x1"}]"#);
        assert_eq!(b[0].id, "x1");
        assert!(parse_kiro_models("bukan json").is_empty());
    }

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
