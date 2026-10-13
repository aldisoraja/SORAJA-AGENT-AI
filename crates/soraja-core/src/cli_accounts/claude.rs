//! Claude Code: akun dari `~/.claude.json` (oauthAccount) & `~/.claude/.credentials.json`
//! (hanya field `subscriptionType`, token TIDAK dibaca), kuota dari `cachedUsageUtilization`
//! yang ditulis Claude Code sendiri saat menampilkan `/usage`.

use super::{expire_window, parse_rfc3339, pretty_plan, read_json, CliUsage, QuotaWindow, UserCliProfile};
use serde_json::Value;
use std::path::Path;

const SOURCE: &str = "~/.claude.json, ~/.claude/.credentials.json";

fn str_at<'a>(v: &'a Value, path: &[&str]) -> Option<&'a str> {
    path.iter().try_fold(v, |acc, k| acc.get(*k))?.as_str().filter(|s| !s.is_empty())
}

pub fn profile(home: &Path) -> UserCliProfile {
    let config = read_json(&home.join(".claude.json")).unwrap_or(Value::Null);
    let creds = read_json(&home.join(".claude").join(".credentials.json")).unwrap_or(Value::Null);
    let account = config.get("oauthAccount").cloned().unwrap_or(Value::Null);
    let has_oauth = !account.is_null() || creds.get("claudeAiOauth").is_some();
    let has_api_key = config.get("primaryApiKey").is_some() || std::env::var_os("ANTHROPIC_API_KEY").is_some();

    let raw_plan = str_at(&creds, &["claudeAiOauth", "subscriptionType"])
        .map(str::to_string)
        .or_else(|| str_at(&account, &["organizationType"]).map(|t| t.trim_start_matches("claude_").to_string()));
    let plan_tier = raw_plan.as_deref().map(pretty_plan).unwrap_or_default();

    let (auth_method, account_type, status) = if has_oauth {
        (
            "subscription",
            if plan_tier.is_empty() { "Claude (langganan)".to_string() } else { format!("Claude {}", plan_tier) },
            "Login Claude.ai aktif di Claude Code".to_string(),
        )
    } else if has_api_key {
        ("api_key", "Anthropic API".to_string(), "Memakai API key Anthropic".to_string())
    } else {
        ("none", String::new(), "Belum login. Jalankan `claude` lalu `/login` di tab Terminal.".to_string())
    };

    UserCliProfile {
        agent_id: "claude".into(),
        is_logged_in: has_oauth || has_api_key,
        auth_method: auth_method.into(),
        name: str_at(&account, &["displayName"]).or(str_at(&account, &["fullName"])).unwrap_or_default().into(),
        email: str_at(&account, &["emailAddress"]).unwrap_or_default().into(),
        plan_tier,
        account_type,
        status_details: status,
        source: SOURCE.into(),
        detected_at: String::new(),
    }
}

fn window(v: &Value, minutes: u32) -> Option<QuotaWindow> {
    let used = v.get("utilization")?.as_f64()?;
    Some(expire_window(QuotaWindow {
        used_percent: used,
        resets_at: v.get("resets_at").and_then(Value::as_str).and_then(parse_rfc3339),
        window_minutes: Some(minutes),
    }))
}

pub fn usage(home: &Path) -> Option<CliUsage> {
    let config = read_json(&home.join(".claude.json"))?;
    let cache = config.get("cachedUsageUtilization")?;
    let util = cache.get("utilization")?;
    let fetched = cache.get("fetchedAtMs").and_then(Value::as_i64).map(|ms| ms / 1000);
    Some(CliUsage {
        five_hour: util.get("five_hour").and_then(|w| window(w, 300)),
        long_window: util.get("seven_day").and_then(|w| window(w, 7 * 24 * 60)),
        source: match fetched {
            Some(t) => format!("Claude Code cachedUsageUtilization (diperbarui {})", t),
            None => "Claude Code cachedUsageUtilization".into(),
        },
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli_accounts::test_home::TempHome;

    fn fixture() -> TempHome {
        TempHome::new(&[
            (
                ".claude.json",
                r#"{"oauthAccount":{"emailAddress":"demo@contoh.id","displayName":"Demo","organizationType":"claude_pro"},
                    "cachedUsageUtilization":{"fetchedAtMs":1791774941972,"utilization":{
                      "five_hour":{"utilization":32,"resets_at":"2999-01-01T00:00:00+00:00"},
                      "seven_day":{"utilization":5,"resets_at":"2000-01-01T00:00:00Z"}}}}"#,
            ),
            (".claude/.credentials.json", r#"{"claudeAiOauth":{"accessToken":"x","subscriptionType":"max"}}"#),
        ])
    }

    #[test]
    fn profil_dari_oauth() {
        let home = fixture();
        let p = profile(home.path());
        assert!(p.is_logged_in);
        assert_eq!(p.auth_method, "subscription");
        assert_eq!(p.email, "demo@contoh.id");
        assert_eq!(p.plan_tier, "Max"); // subscriptionType menang atas organizationType
        assert_eq!(p.account_type, "Claude Max");
    }

    #[test]
    fn kuota_dari_cache_dan_jendela_kedaluwarsa_direset() {
        let home = fixture();
        let u = usage(home.path()).unwrap();
        assert_eq!(u.five_hour.unwrap().used_percent, 32.0);
        let week = u.long_window.unwrap();
        assert_eq!(week.used_percent, 0.0); // resets_at sudah lewat
        assert_eq!(week.resets_at, None);
    }

    #[test]
    fn tanpa_login() {
        let home = TempHome::new(&[]);
        let p = profile(home.path());
        assert!(!p.is_logged_in || std::env::var_os("ANTHROPIC_API_KEY").is_some());
        assert_eq!(p.email, "");
        assert_eq!(p.plan_tier, "");
    }
}
