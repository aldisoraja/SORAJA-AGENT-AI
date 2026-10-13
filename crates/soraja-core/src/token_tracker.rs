//! Statistik pemakaian & sisa kuota per agen untuk dasbor "Models & Usage".
//! Seluruh data berasal dari CLI (lihat `cli_accounts`). Field kuota `None` = CLI tidak
//! menyediakan data tersebut — UI wajib menampilkan "tidak tersedia", bukan angka karangan.

use crate::cli_accounts::{self, CliUsage, QuotaWindow};
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AgentTokenStats {
    pub agent_id: String,
    /// true bila CLI melaporkan minimal satu jendela kuota.
    pub quota_known: bool,
    /// Sisa kuota jendela panjang (mingguan / 30 hari) dalam persen.
    pub weekly_limit_percent: Option<u8>,
    /// Sisa kuota jendela 5 jam dalam persen.
    pub five_hour_limit_percent: Option<u8>,
    /// Unix detik saat kuota direset.
    pub weekly_reset_at: Option<i64>,
    pub five_hour_reset_at: Option<i64>,
    /// Panjang jendela panjang dalam menit (10080 = mingguan, 43200 = 30 hari).
    pub weekly_window_minutes: Option<u32>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    /// Total token yang tercatat CLI (input + output).
    pub used_weekly_tokens: u64,
    pub total_cost_usd: Option<f64>,
    pub sessions_count: u32,
    pub messages_count: u32,
    pub source: String,
    pub status_message: String,
}

fn remaining(w: &Option<QuotaWindow>) -> Option<u8> {
    w.as_ref().map(|w| (100.0 - w.used_percent).clamp(0.0, 100.0).round() as u8)
}

fn window_label(minutes: Option<u32>) -> &'static str {
    match minutes {
        Some(m) if m >= 40000 => "30 hari",
        Some(m) if m > 300 => "mingguan",
        _ => "panjang",
    }
}

pub fn stats_from_usage(agent_id: &str, u: CliUsage) -> AgentTokenStats {
    let weekly = remaining(&u.long_window);
    let five = remaining(&u.five_hour);
    let mut parts = Vec::new();
    if let Some(p) = five {
        parts.push(format!("Sisa 5 jam: {}%", p));
    }
    if let Some(p) = weekly {
        parts.push(format!("Sisa {}: {}%", window_label(u.long_window.as_ref().and_then(|w| w.window_minutes)), p));
    }
    let total = u.input_tokens + u.output_tokens;
    if total > 0 {
        parts.push(format!("{} token tercatat", total));
    }
    if let Some(c) = u.cost_usd {
        parts.push(format!("biaya ${:.2}", c));
    }
    if parts.is_empty() {
        parts.push("CLI belum melaporkan kuota".into());
    }

    AgentTokenStats {
        agent_id: agent_id.into(),
        quota_known: weekly.is_some() || five.is_some(),
        weekly_limit_percent: weekly,
        five_hour_limit_percent: five,
        weekly_reset_at: u.long_window.as_ref().and_then(|w| w.resets_at),
        five_hour_reset_at: u.five_hour.as_ref().and_then(|w| w.resets_at),
        weekly_window_minutes: u.long_window.as_ref().and_then(|w| w.window_minutes),
        input_tokens: u.input_tokens,
        output_tokens: u.output_tokens,
        used_weekly_tokens: total,
        total_cost_usd: u.cost_usd,
        sessions_count: u.sessions,
        messages_count: u.messages,
        status_message: parts.join(" · "),
        source: u.source,
    }
}

pub fn get_live_agent_token_stats(agent_id: &str) -> AgentTokenStats {
    match cli_accounts::get_cli_usage(agent_id) {
        Some(u) => stats_from_usage(agent_id, u),
        None => AgentTokenStats {
            agent_id: agent_id.into(),
            source: "-".into(),
            status_message: "Data kuota belum tersedia dari CLI (jalankan agen minimal sekali, atau cek `/usage` di Terminal).".into(),
            ..Default::default()
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persen_sisa_dan_label_jendela() {
        let s = stats_from_usage(
            "codex",
            CliUsage {
                long_window: Some(QuotaWindow { used_percent: 25.4, resets_at: Some(10), window_minutes: Some(43200) }),
                ..Default::default()
            },
        );
        assert!(s.quota_known);
        assert_eq!(s.weekly_limit_percent, Some(75));
        assert_eq!(s.five_hour_limit_percent, None);
        assert_eq!(s.weekly_reset_at, Some(10));
        assert!(s.status_message.contains("Sisa 30 hari: 75%"));
    }

    #[test]
    fn tanpa_data_tidak_ada_angka_karangan() {
        let s = stats_from_usage("opencode", CliUsage::default());
        assert!(!s.quota_known);
        assert_eq!(s.weekly_limit_percent, None);
        assert_eq!(s.status_message, "CLI belum melaporkan kuota");
    }
}
