export interface SlashConfig {
  modelCmd: string;
  modelLabel: string;
  modelTitle: string;
  usageCmd: string;
  usageLabel: string;
  usageTitle: string;
}

/** Slash command bawaan CLI tiap agen untuk menu "Perintah Mesin CLI". */
export function getSlashConfig(agentId: string): SlashConfig {
  switch (agentId) {
    case 'opencode':
      return {
        modelCmd: '/models\r',
        modelLabel: 'Pilih Model (/models)',
        modelTitle: 'Daftar dan ganti model OpenCode (/models)',
        usageCmd: '/stats\r',
        usageLabel: 'Cek Kuota (/stats)',
        usageTitle: 'Statistik penggunaan token & biaya OpenCode (/stats)',
      };
    case 'claude':
      return {
        modelCmd: '/model\r',
        modelLabel: 'Ganti Model (/model)',
        modelTitle: 'Ganti model Claude Code (/model)',
        usageCmd: '/usage\r',
        usageLabel: 'Cek Kuota (/usage)',
        usageTitle: 'Cek batas pemakaian & sisa kuota Claude Code (/usage)',
      };
    case 'codex':
      return {
        modelCmd: '/model\r',
        modelLabel: 'Ganti Model (/model)',
        modelTitle: 'Ganti model OpenAI Codex (/model)',
        usageCmd: '/status\r',
        usageLabel: 'Cek Kuota (/status)',
        usageTitle: 'Cek status sesi dan token OpenAI Codex (/status)',
      };
    default:
      return {
        modelCmd: '/model\r',
        modelLabel: 'Ganti Model (/model)',
        modelTitle: 'Ganti model Antigravity (/model)',
        usageCmd: '/usage\r',
        usageLabel: 'Cek Kuota (/usage)',
        usageTitle: 'Cek limit dan sisa kuota token Antigravity (/usage)',
      };
  }
}
