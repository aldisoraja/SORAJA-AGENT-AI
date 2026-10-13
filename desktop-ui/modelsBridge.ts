/**
 * modelsBridge.ts — jembatan DEV (Vite): daftar model per agen yang sama dengan menu `/model` CLI-nya.
 * Cermin dari crates/soraja-core/src/agent_models.rs (yang dipakai aplikasi Tauri).
 */
import { execFile } from 'child_process'
import type { LaunchTarget } from './headlessBridge.ts'

export interface BridgeModel {
  id: string
  name: string
  badge: string
  desc: string
  speed: string
  contextWindow?: string
  /** false = model tidak menerima gambar (cermin `supports_images` di agent_models.rs). */
  supportsImages?: boolean
}

const model = (id: string, name: string, badge: string, desc: string, speed: string, contextWindow?: string): BridgeModel => ({
  id, name, badge, desc, speed, contextWindow,
})

function run(target: LaunchTarget, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      target.binary,
      [...target.args, ...args],
      { timeout: 30000, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout) => resolve(err ? '' : String(stdout))
    )
  })
}

/** Menu `/model` Claude Code: alias tetap (tidak ada perintah untuk mendaftarkannya). */
const CLAUDE_MODELS: BridgeModel[] = [
  model('cli-default', 'Default (recommended)', 'DEFAULT', 'Model bawaan akun Anda di Claude Code', 'Native'),
  model('claude-opus-5-5', 'Opus 5.5', 'OPUS', 'Terbaik untuk tugas kompleks sehari-hari', 'Deep'),
  model('claude-fable-5-1', 'Fable 5.1', 'FABLE', 'Paling mampu untuk tugas tersulit dan terpanjang', 'Deep'),
  model('claude-sonnet-5-5', 'Sonnet 5.5', 'SONNET', 'Efisien untuk tugas rutin', 'Fast'),
  model('claude-haiku-5-5', 'Haiku 5.5', 'HAIKU', 'Tercepat untuk jawaban singkat', 'Ultra'),
]

async function codexModels(target: LaunchTarget): Promise<BridgeModel[]> {
  try {
    const json = JSON.parse(await run(target, ['debug', 'models']))
    return (json.models as any[])
      .filter((m) => m.visibility === 'list')
      .sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9))
      .map((m) =>
        model(m.slug, m.display_name || m.slug, 'CODEX', m.description || 'Model OpenAI Codex', 'Native',
          m.context_window ? `${Math.floor(m.context_window / 1000)}k` : undefined)
      )
  } catch {
    return []
  }
}

/** `agy models` → "<id>\t<nama>" per varian effort; digabung per model seperti menu `/model`. */
async function antigravityModels(target: LaunchTarget): Promise<BridgeModel[]> {
  const rank: Record<string, number> = { High: 3, Medium: 2, Low: 1 }
  const groups = new Map<string, { level: number; id: string }>()
  for (const line of (await run(target, ['models'])).split('\n')) {
    const [id, name] = line.trim().split('\t')
    if (!id || !name) continue
    const m = /^(.*) \((High|Medium|Low)\)$/.exec(name)
    const base = m ? m[1] : name
    const level = m ? rank[m[2]] : 0
    const cur = groups.get(base)
    if (!cur || level > cur.level) groups.set(base, { level, id })
  }
  return [...groups].map(([base, g]) => {
    const lower = base.toLowerCase()
    const badge = lower.includes('pro') ? 'PRO' : lower.includes('flash') ? 'FLASH' : 'AGY'
    return model(g.id, base, badge, 'Model dari menu /model Antigravity CLI', badge === 'FLASH' ? 'Ultra' : 'Native')
  })
}

const opencodeTitle = (name: string) => name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

/** `opencode models --verbose`: id per baris diikuti blok JSON (`capabilities.input.image`). */
export function parseOpencodeVerbose(text: string): BridgeModel[] {
  const out: BridgeModel[] = []
  let cur: { id: string; json: string } | null = null
  const flush = () => {
    if (!cur) return
    let img: boolean | undefined
    try {
      const v = JSON.parse(cur.json)?.capabilities?.input?.image
      if (typeof v === 'boolean') img = v
    } catch {
      // metadata tidak lengkap: dukungan gambar tidak diketahui
    }
    const id = cur.id
    const provider = id.slice(0, id.indexOf('/'))
    out.push({ ...model(id, opencodeTitle(id.slice(id.indexOf('/') + 1)), provider.toUpperCase(), `Model live dari opencode (${id})`, 'CLI Live'), supportsImages: img })
  }
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!/^\s/.test(line) && t.includes('/') && !/\s/.test(t) && !t.startsWith('{') && !t.startsWith('}')) {
      flush()
      cur = { id: t, json: '' }
    } else if (cur) {
      cur.json += line + '\n'
    }
  }
  flush()
  return out
}

async function opencodeModels(target: LaunchTarget): Promise<BridgeModel[]> {
  const verbose = parseOpencodeVerbose(await run(target, ['models', '--verbose']))
  if (verbose.length > 0) return verbose
  return (await run(target, ['models']))
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('/') && !/\s/.test(l))
    .map((line) => {
      const [provider, name] = [line.slice(0, line.indexOf('/')), line.slice(line.indexOf('/') + 1)]
      return model(line, opencodeTitle(name), provider.toUpperCase(), `Model live dari opencode (${line})`, 'CLI Live')
    })
}

export async function listCliModels(agentId: string, target: LaunchTarget | undefined): Promise<BridgeModel[]> {
  if (agentId === 'claude') return CLAUDE_MODELS
  if (!target) return []
  if (agentId === 'codex') return codexModels(target)
  if (agentId === 'antigravity') return antigravityModels(target)
  if (agentId === 'opencode') return opencodeModels(target)
  return []
}
