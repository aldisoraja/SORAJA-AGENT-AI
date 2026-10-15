//! Kiro CLI (`kiro-cli`, AWS). Akun dibaca dari `kiro-cli whoami --format json`
//! (kiro-cli 2.31: `{"accountType":"Social","provider":"Google","email":"…"}`).
//! Mode headless (Chat GUI) memakai sesi login yang sama; `KIRO_API_KEY` bersifat opsional.
//! Kuota/kredit TIDAK diekspos CLI di luar TUI (`/usage`) dan `kiro-cli profile` hanya untuk
//! pengguna Pro → kuota dibiarkan `None` (tidak ada angka karangan).

use super::UserCliProfile;
use crate::agent_catalog::detect_cli;
use crate::agent_models::run_cli;
use std::path::Path;

const SOURCE: &str = "`kiro-cli whoami --format json`";

/// Hasil `whoami` yang sudah diurai.
#[derive(Debug, PartialEq)]
pub struct Whoami {
    pub email: String,
    pub provider: String,
    pub account_type: String,
}

pub fn parse_whoami(text: &str) -> Option<Whoami> {
    let json: serde_json::Value = serde_json::from_str(text.trim()).ok()?;
    let get = |k: &str| json[k].as_str().unwrap_or_default().trim().to_string();
    let w = Whoami { email: get("email"), provider: get("provider"), account_type: get("accountType") };
    (!w.email.is_empty() || !w.provider.is_empty() || !w.account_type.is_empty()).then_some(w)
}

fn plan_label(w: &Whoami) -> String {
    match (w.provider.as_str(), w.account_type.as_str()) {
        ("", "") => "Kiro".into(),
        ("", t) => format!("Kiro ({t})"),
        (p, _) => format!("Kiro ({p})"),
    }
}

pub fn profile(home: &Path) -> UserCliProfile {
    let api_key = std::env::var("KIRO_API_KEY").map(|v| !v.trim().is_empty()).unwrap_or(false);
    let (installed, bin) = detect_cli("kiro-cli");
    let who = if installed { bin.and_then(|b| run_cli(&b, &["whoami", "--format", "json"])).and_then(|t| parse_whoami(&t)) } else { None };

    if let Some(w) = who {
        return UserCliProfile {
            agent_id: "kiro".into(),
            is_logged_in: true,
            auth_method: if api_key { "api_key" } else { "subscription" }.into(),
            email: w.email.clone(),
            plan_tier: w.account_type.clone(),
            account_type: plan_label(&w),
            status_details: if api_key {
                "Login Kiro aktif + KIRO_API_KEY terdeteksi.".into()
            } else {
                format!("Login Kiro aktif{}.", if w.provider.is_empty() { String::new() } else { format!(" via {}", w.provider) })
            },
            source: SOURCE.into(),
            ..Default::default()
        };
    }
    UserCliProfile {
        agent_id: "kiro".into(),
        is_logged_in: api_key,
        auth_method: if api_key { "api_key" } else { "none" }.into(),
        account_type: if api_key { "Kiro (API key)".into() } else { String::new() },
        status_details: if api_key {
            "KIRO_API_KEY terdeteksi.".into()
        } else if installed || home.join(".kiro").exists() {
            "Belum login. Buka tab Terminal lalu jalankan `kiro-cli login`.".into()
        } else {
            "Kiro CLI belum terpasang.".into()
        },
        source: SOURCE.into(),
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_whoami, Whoami};

    #[test]
    fn whoami_nyata_kiro_2_31() {
        let w = parse_whoami(r#"{"accountType":"Social","provider":"Google","email":"a@b.c"}"#).unwrap();
        assert_eq!(w, Whoami { email: "a@b.c".into(), provider: "Google".into(), account_type: "Social".into() });
    }

    #[test]
    fn whoami_kosong_atau_bukan_json_dianggap_belum_login() {
        assert!(parse_whoami("{}").is_none());
        assert!(parse_whoami("Not logged in").is_none());
    }
}
