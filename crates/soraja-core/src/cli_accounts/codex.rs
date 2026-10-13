//! Codex CLI: akun dari `~/.codex/auth.json` (klaim payload JWT `id_token`, tanpa verifikasi
//! tanda tangan — hanya untuk tampilan), kuota dari event `token_count.rate_limits` di
//! log sesi terbaru `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.

use super::{base64url_decode, expire_window, pretty_plan, read_json, CliUsage, QuotaWindow, UserCliProfile};
use serde_json::Value;
use std::path::{Path, PathBuf};

const SOURCE: &str = "~/.codex/auth.json, ~/.codex/sessions";

fn jwt_claims(jwt: &str) -> Option<Value> {
    let payload = jwt.split('.').nth(1)?;
    serde_json::from_slice(&base64url_decode(payload)?).ok()
}

pub fn profile(home: &Path) -> UserCliProfile {
    let base = UserCliProfile { agent_id: "codex".into(), source: SOURCE.into(), ..Default::default() };
    let Some(auth) = read_json(&home.join(".codex").join("auth.json")) else {
        return UserCliProfile {
            auth_method: "none".into(),
            status_details: "Belum login. Jalankan `codex login` di tab Terminal.".into(),
            ..base
        };
    };

    let claims = auth
        .pointer("/tokens/id_token")
        .and_then(Value::as_str)
        .and_then(jwt_claims)
        .unwrap_or(Value::Null);
    let openai = claims.get("https://api.openai.com/auth").cloned().unwrap_or(Value::Null);
    let raw_plan = openai.get("chatgpt_plan_type").and_then(Value::as_str).unwrap_or("");
    let has_api_key = auth.get("OPENAI_API_KEY").and_then(Value::as_str).is_some_and(|k| !k.is_empty());
    let is_chatgpt = auth.get("auth_mode").and_then(Value::as_str) == Some("chatgpt") || !claims.is_null();

    let plan_tier = pretty_plan(raw_plan);
    let (auth_method, account_type, status) = if is_chatgpt {
        (
            "subscription",
            if plan_tier.is_empty() { "ChatGPT".to_string() } else { format!("ChatGPT {}", plan_tier) },
            "Login ChatGPT aktif di Codex CLI".to_string(),
        )
    } else if has_api_key {
        ("api_key", "OpenAI API".to_string(), "Memakai API key OpenAI".to_string())
    } else {
        ("none", String::new(), "Belum login. Jalankan `codex login` di tab Terminal.".to_string())
    };

    UserCliProfile {
        is_logged_in: is_chatgpt || has_api_key,
        auth_method: auth_method.into(),
        name: claims.get("name").and_then(Value::as_str).unwrap_or_default().into(),
        email: claims.get("email").and_then(Value::as_str).unwrap_or_default().into(),
        plan_tier,
        account_type,
        status_details: status,
        ..base
    }
}

/// Berkas rollout terbaru (nama folder & berkas berurutan secara leksikografis menurut waktu).
fn latest_rollout(dir: &Path) -> Option<PathBuf> {
    let mut newest: Option<PathBuf> = None;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        for entry in std::fs::read_dir(&d).ok()?.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if p.extension().is_some_and(|e| e == "jsonl")
                && newest.as_ref().is_none_or(|n| p.file_name() > n.file_name())
            {
                newest = Some(p);
            }
        }
    }
    newest
}

fn window(v: &Value) -> Option<QuotaWindow> {
    if v.is_null() {
        return None;
    }
    Some(expire_window(QuotaWindow {
        used_percent: v.get("used_percent")?.as_f64()?,
        resets_at: v.get("resets_at").and_then(Value::as_i64),
        window_minutes: v.get("window_minutes").and_then(Value::as_u64).map(|m| m as u32),
    }))
}

pub fn usage(home: &Path) -> Option<CliUsage> {
    let file = latest_rollout(&home.join(".codex").join("sessions"))?;
    let content = std::fs::read_to_string(&file).ok()?;
    let event = content
        .lines()
        .rev()
        .filter(|l| l.contains("\"rate_limits\""))
        .find_map(|l| serde_json::from_str::<Value>(l).ok())?;
    let payload = event.get("payload")?;
    let limits = payload.get("rate_limits")?;
    let usage = payload.pointer("/info/total_token_usage");

    // Jendela ≤ 5 jam = kuota pendek; selebihnya = jendela panjang (mingguan / 30 hari).
    let mut five_hour = None;
    let mut long_window = None;
    for w in ["primary", "secondary"].iter().filter_map(|k| limits.get(*k)).filter_map(window) {
        if w.window_minutes.is_some_and(|m| m <= 300) {
            five_hour = Some(w);
        } else {
            long_window = Some(w);
        }
    }

    Some(CliUsage {
        five_hour,
        long_window,
        input_tokens: usage.and_then(|u| u.get("input_tokens")).and_then(Value::as_u64).unwrap_or(0),
        output_tokens: usage.and_then(|u| u.get("output_tokens")).and_then(Value::as_u64).unwrap_or(0),
        source: format!("Codex rollout {}", file.file_name()?.to_string_lossy()),
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli_accounts::test_home::TempHome;

    // payload: {"email":"demo@contoh.id","name":"Demo","https://api.openai.com/auth":{"chatgpt_plan_type":"plus"}}
    const ID_TOKEN: &str = "h.eyJlbWFpbCI6ImRlbW9AY29udG9oLmlkIiwibmFtZSI6IkRlbW8iLCJodHRwczovL2FwaS5vcGVuYWkuY29tL2F1dGgiOnsiY2hhdGdwdF9wbGFuX3R5cGUiOiJwbHVzIn19.s";

    #[test]
    fn profil_dari_klaim_jwt() {
        let auth = format!(r#"{{"auth_mode":"chatgpt","tokens":{{"id_token":"{}"}}}}"#, ID_TOKEN);
        let home = TempHome::new(&[(".codex/auth.json", &auth)]);
        let p = profile(home.path());
        assert!(p.is_logged_in);
        assert_eq!(p.email, "demo@contoh.id");
        assert_eq!(p.plan_tier, "Plus");
        assert_eq!(p.account_type, "ChatGPT Plus");
    }

    #[test]
    fn kuota_dari_rollout_terbaru() {
        let old = r#"{"payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":99,"window_minutes":300,"resets_at":4102444800}}}}"#;
        let new = r#"{"payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"output_tokens":5}},"rate_limits":{"primary":{"used_percent":12.5,"window_minutes":300,"resets_at":4102444800},"secondary":{"used_percent":40,"window_minutes":10080,"resets_at":4102444800}}}}"#;
        let home = TempHome::new(&[
            (".codex/sessions/2026/10/01/rollout-2026-10-01T00-00-00-a.jsonl", old),
            (".codex/sessions/2026/10/12/rollout-2026-10-12T09-00-00-b.jsonl", new),
        ]);
        let u = usage(home.path()).unwrap();
        assert_eq!(u.five_hour.unwrap().used_percent, 12.5);
        assert_eq!(u.long_window.unwrap().window_minutes, Some(10080));
        assert_eq!((u.input_tokens, u.output_tokens), (10, 5));
    }
}
