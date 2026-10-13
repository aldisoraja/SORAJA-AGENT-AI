//! OpenCode: multi-provider (tidak punya "paket langganan" tunggal). Akun = daftar provider di
//! `~/.local/share/opencode/auth.json` (hanya nama provider, kunci TIDAK dibaca); pemakaian dari
//! `opencode stats`. OpenCode tidak mengekspos batas kuota → jendela kuota dibiarkan `None`.

use super::{read_json, CliUsage, UserCliProfile};
use std::path::Path;

const SOURCE: &str = "~/.local/share/opencode/auth.json, `opencode stats`";

pub fn profile(home: &Path) -> UserCliProfile {
    let providers: Vec<String> = read_json(&home.join(".local").join("share").join("opencode").join("auth.json"))
        .and_then(|v| v.as_object().map(|o| o.keys().cloned().collect()))
        .unwrap_or_default();
    let logged_in = !providers.is_empty();
    UserCliProfile {
        agent_id: "opencode".into(),
        is_logged_in: logged_in,
        auth_method: if logged_in { "multi_provider" } else { "none" }.into(),
        plan_tier: if logged_in { "Multi-provider".into() } else { String::new() },
        account_type: if logged_in { format!("OpenCode ({} provider)", providers.len()) } else { String::new() },
        status_details: if logged_in {
            format!("Provider terhubung: {}", providers.join(", "))
        } else {
            "Belum ada provider. Jalankan `opencode auth login` di tab Terminal.".into()
        },
        source: SOURCE.into(),
        ..Default::default()
    }
}

fn last_token(line: &str) -> Option<&str> {
    line.split_whitespace().last()
}

fn parse_shorthand(val: &str) -> u64 {
    let s = val.trim().to_uppercase().replace(',', "");
    let (num, mult) = match s.chars().last() {
        Some('M') => (&s[..s.len() - 1], 1_000_000.0),
        Some('K') => (&s[..s.len() - 1], 1_000.0),
        _ => (s.as_str(), 1.0),
    };
    (num.parse::<f64>().unwrap_or(0.0) * mult) as u64
}

/// Mengurai tabel TUI `opencode stats`.
pub fn parse_stats(text: &str) -> CliUsage {
    let mut u = CliUsage { source: "`opencode stats`".into(), ..Default::default() };
    for line in text.lines() {
        let clean = line.replace(['│', '┌', '┐', '└', '┘', '├', '┤', '─'], "");
        let t = clean.trim();
        let val = last_token(t).unwrap_or("");
        if t.starts_with("Sessions") {
            u.sessions = val.parse().unwrap_or(0);
        } else if t.starts_with("Messages") {
            u.messages = val.parse().unwrap_or(0);
        } else if t.starts_with("Total Cost") {
            u.cost_usd = val.trim_start_matches('$').parse().ok();
        } else if t.starts_with("Input") {
            u.input_tokens = parse_shorthand(val);
        } else if t.starts_with("Output") {
            u.output_tokens = parse_shorthand(val);
        }
    }
    u
}

pub fn usage() -> Option<CliUsage> {
    let (installed, bin) = crate::agent_catalog::detect_cli("opencode");
    if !installed {
        return None;
    }
    let bin = bin.unwrap_or_else(|| "opencode".into());
    let lower = bin.to_lowercase();
    let mut cmd = if cfg!(windows) && (lower.ends_with(".cmd") || lower.ends_with(".bat")) {
        let mut c = std::process::Command::new("cmd");
        c.args(["/c", &bin, "stats"]);
        c
    } else {
        let mut c = std::process::Command::new(&bin);
        c.arg("stats");
        c
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(parse_stats(&String::from_utf8_lossy(&output.stdout)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli_accounts::test_home::TempHome;

    const SAMPLE: &str = "│Sessions                                             38 │
│Messages                                            819 │
│Total Cost                                        $0.89 │
│Avg Tokens/Session                                 1.9M │
│Input                                              3.2M │
│Output                                           276.1K │";

    #[test]
    fn parse_output_opencode_stats() {
        let u = parse_stats(SAMPLE);
        assert_eq!((u.sessions, u.messages), (38, 819));
        assert_eq!(u.cost_usd, Some(0.89));
        assert_eq!((u.input_tokens, u.output_tokens), (3_200_000, 276_100));
        assert!(u.five_hour.is_none() && u.long_window.is_none());
    }

    #[test]
    fn profil_dari_nama_provider_saja() {
        let home = TempHome::new(&[(".local/share/opencode/auth.json", r#"{"zai":{"type":"api","key":"rahasia"},"ollama":{}}"#)]);
        let p = profile(home.path());
        assert!(p.is_logged_in);
        assert_eq!(p.account_type, "OpenCode (2 provider)");
        assert!(!p.status_details.contains("rahasia"));
    }
}
