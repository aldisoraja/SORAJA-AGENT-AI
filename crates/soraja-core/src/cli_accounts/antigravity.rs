//! Antigravity CLI (`agy`): CLI tidak menyimpan email/paket dalam berkas yang bisa dibaca.
//! Login dideteksi dari berkas token OAuth (isinya TIDAK dibaca). Email, paket (banner
//! "email (Google AI Pro)") dan kuota di-scrape dari satu sesi PTY `agy` + `/usage`, di-cache 60 detik.
//! Sesi dijalankan di folder yang sudah dipercaya agy (settings.json → trustedWorkspaces) agar
//! tidak tertahan prompt "Do you trust this project?".

use super::{now_secs, CliUsage, QuotaWindow, UserCliProfile};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const SOURCE: &str = "~/.gemini/jetski-standalone-oauth-token, `agy /usage`";

pub fn profile(home: &Path) -> UserCliProfile {
    let gemini = home.join(".gemini");
    let logged_in = [gemini.join("jetski-standalone-oauth-token"), gemini.join("antigravity-cli").join("jetski-standalone-oauth-token")]
        .iter()
        .any(|p| p.exists());
    #[allow(unused_mut)]
    let mut p = UserCliProfile {
        agent_id: "antigravity".into(),
        is_logged_in: logged_in,
        auth_method: if logged_in { "subscription" } else { "none" }.into(),
        account_type: if logged_in { "Akun Google (Antigravity)".into() } else { String::new() },
        status_details: if logged_in {
            "Login Google aktif.".into()
        } else {
            "Belum login. Jalankan `agy` di tab Terminal untuk login Google.".into()
        },
        source: SOURCE.into(),
        ..Default::default()
    };
    #[cfg(not(test))]
    if logged_in {
        if let Some((email, plan)) = scrape_cached(home).as_deref().map(parse_account) {
            p.email = email.unwrap_or_default();
            if let Some(plan) = plan {
                p.plan_tier = plan.trim_start_matches("Google").trim().to_string();
                p.account_type = plan;
            }
        }
    }
    p
}

/// Email & paket dari banner/`/usage`: "email (Google AI Pro)" atau "Account: email".
pub fn parse_account(text: &str) -> (Option<String>, Option<String>) {
    let email_re = regex::Regex::new(r"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?:[ \t]+\(([^)\n]+)\))?").unwrap();
    let mut email = None;
    let mut plan = None;
    for c in email_re.captures_iter(text) {
        email.get_or_insert_with(|| c[1].to_string());
        if plan.is_none() {
            plan = c.get(2).map(|m| m.as_str().trim().to_string());
        }
    }
    (email, plan)
}

/// "162h 31m" / "4h" / "20m" → detik.
fn duration_secs(text: &str) -> Option<i64> {
    let mut total = 0i64;
    let mut found = false;
    for part in text.split_whitespace() {
        let (num, unit) = part.split_at(part.find(|c: char| !c.is_ascii_digit())?);
        let n: i64 = num.parse().ok()?;
        total += match unit {
            "d" => n * 86400,
            "h" => n * 3600,
            "m" => n * 60,
            "s" => n,
            _ => return None,
        };
        found = true;
    }
    found.then_some(total)
}

/// Mengurai satu blok "<label> Remaining … NN.NN% … Refreshes in Xh Ym" menjadi jendela kuota.
fn parse_window(text: &str, label: &str, minutes: u32) -> Option<QuotaWindow> {
    let pct = regex::Regex::new(&format!(r"{}[\s\S]*?([\d.]+)%", regex::escape(label))).ok()?;
    let remaining: f64 = pct.captures(text)?[1].parse().ok()?;
    let refresh = regex::Regex::new(&format!(r"{}[\s\S]*?Refreshes in\s*([\dhdms ]+)", regex::escape(label))).ok()?;
    let resets_at = refresh
        .captures(text)
        .and_then(|c| duration_secs(c[1].trim()))
        .map(|s| now_secs() + s);
    Some(QuotaWindow { used_percent: (100.0 - remaining).clamp(0.0, 100.0), resets_at, window_minutes: Some(minutes) })
}

/// Mengurai output `/usage` (ANSI sudah dibuang).
pub fn parse_usage(text: &str) -> Option<CliUsage> {
    let five_hour = parse_window(text, "Five Hour Limit Remaining", 300);
    let long_window = parse_window(text, "Weekly Limit Remaining", 7 * 24 * 60);
    if five_hour.is_none() && long_window.is_none() {
        return None;
    }
    Some(CliUsage { five_hour, long_window, source: "`agy /usage`".into(), ..Default::default() })
}

fn run_usage_in_pty(bin: &str, cwd: Option<&str>) -> String {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::io::{Read, Write};
    use std::time::Duration;

    let Ok(pair) = native_pty_system().openpty(PtySize { rows: 30, cols: 120, pixel_width: 0, pixel_height: 0 }) else {
        return String::new();
    };
    let mut cmd = CommandBuilder::new(bin);
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }
    let Ok(mut child) = pair.slave.spawn_command(cmd) else {
        return String::new();
    };
    drop(pair.slave);
    let (Ok(mut reader), Ok(mut writer)) = (pair.master.try_clone_reader(), pair.master.take_writer()) else {
        let _ = child.kill();
        return String::new();
    };
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut all = Vec::new();
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            all.extend_from_slice(&buf[..n]);
        }
        let _ = tx.send(String::from_utf8_lossy(&all).to_string());
    });
    std::thread::sleep(Duration::from_millis(2800)); // tunggu sign-in & banner
    let _ = write!(writer, "/usage\r");
    std::thread::sleep(Duration::from_millis(2200));
    let _ = write!(writer, "/exit\r");
    std::thread::sleep(Duration::from_millis(300));
    let _ = child.kill();
    drop(pair.master);
    let raw = rx.recv_timeout(Duration::from_millis(800)).unwrap_or_default();
    regex::Regex::new(r"\x1b\[[0-9;?<>= ]*[a-zA-Z]")
        .map(|re| re.replace_all(&raw, "").to_string())
        .unwrap_or(raw)
}

/// Folder pertama yang sudah dipercaya agy; None bila belum ada.
fn trusted_dir(home: &Path) -> Option<String> {
    let json = super::read_json(&home.join(".gemini").join("antigravity-cli").join("settings.json"))?;
    json.get("trustedWorkspaces")?
        .as_array()?
        .iter()
        .filter_map(|v| v.as_str())
        .find(|d| Path::new(d).is_dir())
        .map(str::to_string)
}

static CACHE: Mutex<Option<(Instant, String)>> = Mutex::new(None);

/// Satu sesi PTY dibagi untuk profil & kuota (lock dipegang selama scrape agar tidak ada sesi ganda).
fn scrape_cached(home: &Path) -> Option<String> {
    let mut guard = CACHE.lock().ok()?;
    if let Some((at, text)) = guard.as_ref() {
        if at.elapsed() < Duration::from_secs(60) {
            return Some(text.clone());
        }
    }
    let (installed, bin) = crate::agent_catalog::detect_cli("agy");
    if !installed {
        return None;
    }
    let text = run_usage_in_pty(&bin.unwrap_or_else(|| "agy".into()), trusted_dir(home).as_deref());
    if text.trim().is_empty() {
        return None;
    }
    *guard = Some((Instant::now(), text.clone()));
    Some(text)
}

pub fn usage() -> Option<CliUsage> {
    let home = super::user_home()?;
    parse_usage(&scrape_cached(&home)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_output_usage() {
        let text = "Weekly Limit Remaining  [#######   ] 85.47%  Refreshes in 162h 31m\n\
                    Five Hour Limit Remaining [###  ] 31.80% Refreshes in 2h 8m";
        let u = parse_usage(text).unwrap();
        let week = u.long_window.unwrap();
        assert!((week.used_percent - 14.53).abs() < 0.01);
        let five = u.five_hour.unwrap();
        assert!((five.used_percent - 68.2).abs() < 0.01);
        let reset_in = five.resets_at.unwrap() - now_secs();
        assert!((2 * 3600 + 8 * 60 - 5..=2 * 3600 + 8 * 60).contains(&reset_in));
    }

    #[test]
    fn login_terdeteksi_dari_berkas_token_tanpa_membacanya() {
        let home = crate::cli_accounts::test_home::TempHome::new(&[(".gemini/jetski-standalone-oauth-token", "x")]);
        assert!(profile(home.path()).is_logged_in);
    }

    #[test]
    fn email_dan_paket_dari_banner_dan_usage() {
        let banner = "Antigravity CLI 1.3.3\naldisoraja1@gmail.com (Google AI Pro)\nGemini 3.8 Flash";
        assert_eq!(parse_account(banner), (Some("aldisoraja1@gmail.com".into()), Some("Google AI Pro".into())));
        let only_usage = "Models & Quota  Account: a@b.id\n";
        assert_eq!(parse_account(only_usage), (Some("a@b.id".into()), None));
    }

    #[test]
    fn quota_available_dan_persen_dua_grup_memakai_grup_gemini() {
        let text = "GEMINI MODELS\n Weekly Limit Remaining\n [###] 46.68%\n Refreshes in 45h 47m\n Five Hour Limit Remaining\n [##] 81.14%\n Refreshes in 15m\nCLAUDE AND GPT MODELS\n Weekly Limit Remaining\n [###] 100.00%\n Quota available";
        let u = parse_usage(text).unwrap();
        assert!((u.long_window.unwrap().used_percent - 53.32).abs() < 0.01);
        assert!((u.five_hour.unwrap().used_percent - 18.86).abs() < 0.01);
    }

    #[test]
    fn output_kosong_tidak_mengarang_angka() {
        assert!(parse_usage("").is_none());
    }
}
