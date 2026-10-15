//! Akun, paket langganan & kuota yang dibaca LANGSUNG dari berkas milik masing-masing CLI agen.
//! Tidak ada angka karangan: bila data tidak tersedia, field dibiarkan kosong/`None`.
//! Spesifikasi: specs/agent-protocols.md §4.
//!
//! | Agen        | Akun & paket                                        | Kuota                                    |
//! |-------------|-----------------------------------------------------|------------------------------------------|
//! | claude      | `~/.claude.json` (oauthAccount), `.credentials.json` | `~/.claude.json` → cachedUsageUtilization |
//! | codex       | `~/.codex/auth.json` → klaim JWT id_token           | `~/.codex/sessions/**.jsonl` → rate_limits |
//! | antigravity | — (tidak diekspos CLI)                              | `agy` → `/usage` (scrape TUI)            |
//! | opencode    | `~/.local/share/opencode/auth.json` (provider)      | `opencode stats` (token & biaya)          |
//! | kiro        | env `KIRO_API_KEY` (headless), `kiro-cli login`     | — (tidak diekspos CLI)                   |

pub mod antigravity;
pub mod claude;
pub mod codex;
pub mod kiro;
pub mod opencode;

use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UserCliProfile {
    pub agent_id: String,
    /// true bila CLI memiliki sesi login (OAuth/langganan) atau kredensial API tersimpan.
    pub is_logged_in: bool,
    /// "subscription" | "api_key" | "multi_provider" | "none"
    pub auth_method: String,
    pub name: String,
    pub email: String,
    /// Nama paket singkat dari CLI, mis. "Pro", "Max", "Plus", "Free". Kosong bila tidak diketahui.
    pub plan_tier: String,
    /// Label paket lengkap, mis. "Claude Pro", "ChatGPT Free", "Google AI Pro".
    pub account_type: String,
    pub status_details: String,
    /// Berkas/perintah sumber data (untuk transparansi di UI).
    pub source: String,
    pub detected_at: String,
}

/// Satu jendela kuota (mis. 5 jam atau mingguan) sebagaimana dilaporkan CLI.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QuotaWindow {
    pub used_percent: f64,
    /// Unix detik saat kuota direset.
    pub resets_at: Option<i64>,
    pub window_minutes: Option<u32>,
}

#[derive(Debug, Clone, Default)]
pub struct CliUsage {
    pub five_hour: Option<QuotaWindow>,
    /// Jendela panjang (mingguan, atau 30 hari untuk paket gratis Codex).
    pub long_window: Option<QuotaWindow>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: Option<f64>,
    pub sessions: u32,
    pub messages: u32,
    pub source: String,
}

pub fn user_home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

pub(crate) fn read_json(path: &Path) -> Option<serde_json::Value> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

pub(crate) fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

/// Kapitalisasi nama paket: "pro" → "Pro", "max_20x" → "Max 20x".
pub(crate) fn pretty_plan(raw: &str) -> String {
    raw.split(['_', '-', ' '])
        .filter(|s| !s.is_empty())
        .map(|w| {
            let mut c = w.chars();
            c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Parser RFC 3339 minimal ("2026-10-12T07:20:00.05+00:00" / "...Z") → Unix detik.
pub(crate) fn parse_rfc3339(s: &str) -> Option<i64> {
    let s = s.trim();
    let (date, rest) = s.split_once('T')?;
    let mut d = date.split('-').map(|p| p.parse::<i64>());
    let (y, m, day) = (d.next()?.ok()?, d.next()?.ok()?, d.next()?.ok()?);
    let tz_pos = rest.find(['Z', 'z', '+']).or_else(|| rest.rfind('-'))?;
    let (time, tz) = rest.split_at(tz_pos);
    let mut t = time.split(':');
    let hh: i64 = t.next()?.parse().ok()?;
    let mm: i64 = t.next()?.parse().ok()?;
    let ss: i64 = t.next().unwrap_or("0").split('.').next()?.parse().ok()?;
    let offset = if tz.eq_ignore_ascii_case("z") {
        0
    } else {
        let sign = if tz.starts_with('-') { -1 } else { 1 };
        let (oh, om) = tz[1..].split_once(':').unwrap_or((&tz[1..], "0"));
        sign * (oh.parse::<i64>().ok()? * 3600 + om.parse::<i64>().ok()? * 60)
    };
    // days_from_civil (Howard Hinnant)
    let y2 = if m <= 2 { y - 1 } else { y };
    let era = y2.div_euclid(400);
    let yoe = y2 - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    Some(days * 86400 + hh * 3600 + mm * 60 + ss - offset)
}

/// Kuota yang jendelanya sudah lewat dianggap reset (0% terpakai).
pub(crate) fn expire_window(w: QuotaWindow) -> QuotaWindow {
    match w.resets_at {
        Some(t) if t <= now_secs() => QuotaWindow { used_percent: 0.0, resets_at: None, ..w },
        _ => w,
    }
}

/// Dekoder base64url tanpa padding (untuk payload JWT); tanpa dependensi tambahan.
pub(crate) fn base64url_decode(input: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits = 0;
    for c in input.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'-' | b'+' => 62,
            b'_' | b'/' => 63,
            b'=' => break,
            _ => return None,
        } as u32;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Some(out)
}

fn not_logged_in(agent_id: &str, source: &str, hint: &str) -> UserCliProfile {
    UserCliProfile {
        agent_id: agent_id.into(),
        auth_method: "none".into(),
        status_details: hint.into(),
        source: source.into(),
        ..Default::default()
    }
}

/// Profil akun dari CLI. Tidak pernah mengarang email/paket.
pub fn get_user_cli_profile(agent_id: &str) -> UserCliProfile {
    let Some(home) = user_home() else {
        return not_logged_in(agent_id, "-", "Direktori home pengguna tidak ditemukan");
    };
    let mut profile = match agent_id {
        "claude" => claude::profile(&home),
        "codex" => codex::profile(&home),
        "opencode" => opencode::profile(&home),
        "antigravity" | "agy" => antigravity::profile(&home),
        "kiro" | "kiro-cli" => kiro::profile(&home),
        _ => not_logged_in(agent_id, "-", "Agen tidak dikenal"),
    };
    profile.detected_at = now_secs().to_string();
    profile
}

/// Pemakaian & kuota dari CLI (None bila sumber tidak tersedia).
pub fn get_cli_usage(agent_id: &str) -> Option<CliUsage> {
    let home = user_home()?;
    match agent_id {
        "claude" => claude::usage(&home),
        "codex" => codex::usage(&home),
        "opencode" => opencode::usage(),
        "antigravity" | "agy" => antigravity::usage(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64url_jwt_payload() {
        // {"a":1} → eyJhIjoxfQ
        assert_eq!(base64url_decode("eyJhIjoxfQ").unwrap(), br#"{"a":1}"#);
    }

    #[test]
    fn rfc3339_ke_unix() {
        assert_eq!(parse_rfc3339("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_rfc3339("2026-10-12T07:20:00.059860+00:00"), Some(1791789600));
        assert_eq!(parse_rfc3339("2026-10-12T14:20:00+07:00"), Some(1791789600));
    }

    #[test]
    fn nama_paket_rapi() {
        assert_eq!(pretty_plan("pro"), "Pro");
        assert_eq!(pretty_plan("max_20x"), "Max 20x");
    }
}

/// Direktori home sementara untuk unit test (tanpa crate tambahan).
#[cfg(test)]
pub(crate) mod test_home {
    use std::path::{Path, PathBuf};

    pub struct TempHome(PathBuf);

    impl TempHome {
        pub fn new(files: &[(&str, &str)]) -> Self {
            static COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
            let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let dir = std::env::temp_dir().join(format!("soraja-test-{}-{}", std::process::id(), n));
            for (rel, content) in files {
                let p = dir.join(rel);
                std::fs::create_dir_all(p.parent().unwrap()).unwrap();
                std::fs::write(p, content).unwrap();
            }
            std::fs::create_dir_all(&dir).unwrap();
            TempHome(dir)
        }
        pub fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempHome {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}
