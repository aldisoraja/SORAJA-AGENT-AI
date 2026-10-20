/**
 * agentStartupChoice.ts
 * Agen default saat aplikasi dibuka. Pilihan terakhir disimpan di localStorage (bertahan setelah
 * aplikasi ditutup, tidak seperti sessionStorage), lalu diselaraskan dengan CLI yang terpasang:
 *   1. agen terakhir dipakai (bila terpasang)
 *   2. satu-satunya agen yang terpasang
 *   3. agen terpasang yang paling sering dipakai di riwayat percakapan
 *   4. urutan katalog di antara agen yang terpasang
 */
import type { ConversationRecord } from '../types/database';

const PREFIX = 'soraja.prefs.';

export function loadLastAgentChoice(): { agentId: string; modelId: string } {
  try {
    return {
      agentId: localStorage.getItem(PREFIX + 'lastAgentId') || '',
      modelId: localStorage.getItem(PREFIX + 'lastModelId') || '',
    };
  } catch {
    return { agentId: '', modelId: '' };
  }
}

export function saveLastAgentChoice(key: 'lastAgentId' | 'lastModelId', value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // localStorage tidak tersedia: pilihan agen hanya bertahan selama aplikasi terbuka
  }
}

/**
 * @param catalogIds urutan agen di katalog (cadangan terakhir)
 * @param installedIds agen yang CLI-nya terdeteksi terpasang
 * @returns id agen terpilih, atau null bila tidak ada CLI terpasang (pilihan saat ini dibiarkan)
 */
export function pickStartupAgentId(
  catalogIds: string[],
  installedIds: string[],
  lastAgentId: string,
  conversations: ConversationRecord[]
): string | null {
  const installed = catalogIds.filter((id) => installedIds.includes(id));
  if (installed.length === 0) return null;
  if (installed.includes(lastAgentId)) return lastAgentId;
  if (installed.length === 1) return installed[0];

  const usage = new Map<string, number>();
  for (const c of conversations) {
    if (installed.includes(c.agentId)) usage.set(c.agentId, (usage.get(c.agentId) ?? 0) + 1);
  }
  // sort stabil: jumlah pemakaian sama → tetap mengikuti urutan katalog
  return [...installed].sort((a, b) => (usage.get(b) ?? 0) - (usage.get(a) ?? 0))[0];
}
