//! Menampilkan profil akun & kuota yang dibaca dari CLI di mesin ini (tanpa token/rahasia).
//! Jalankan: `cargo run -p soraja-core --example print_accounts`

fn main() {
    for agent in ["claude", "codex", "antigravity", "opencode", "kiro"] {
        let profile = soraja_core::cli_accounts::get_user_cli_profile(agent);
        let stats = soraja_core::token_tracker::get_live_agent_token_stats(agent);
        println!("== {agent}");
        println!("{}", serde_json::to_string_pretty(&profile).unwrap_or_default());
        println!("{}", serde_json::to_string_pretty(&stats).unwrap_or_default());
    }
}
