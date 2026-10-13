/**
 * cliBridge.ts — jembatan DEV (Vite) agar mode browser membaca akun & kuota riil dari berkas CLI,
 * dengan logika yang sama seperti crates/soraja-core/src/cli_accounts (token tidak pernah dibaca/dikirim).
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as pty from 'node-pty'

const home = os.homedir()
const readJson = (p: string): any => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}
const pretty = (s: string) =>
  s
    .split(/[_\- ]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
const unix = (iso?: string) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? null : Math.floor(t / 1000)
}
const now = () => Math.floor(Date.now() / 1000)

function base(agentId: string, source: string) {
  return {
    agentId,
    isLoggedIn: false,
    authMethod: 'none',
    name: '',
    email: '',
    planTier: '',
    accountType: '',
    statusDetails: 'Belum login. Login lewat tab Terminal CLI.',
    source,
    detectedAt: String(now()),
  }
}

/** Satu sesi PTY `agy` (banner + /usage), di-cache 60 detik, dijalankan di folder yang sudah dipercaya agy. */
let agyCache: { at: number; text: string } | null = null
let agyPending: Promise<string> | null = null

function scrapeAgy(): Promise<string> {
  if (agyCache && Date.now() - agyCache.at < 60000) return Promise.resolve(agyCache.text)
  if (agyPending) return agyPending
  const bin = path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'agy', 'bin', 'agy.exe')
  const trusted: string[] = readJson(path.join(home, '.gemini', 'antigravity-cli', 'settings.json'))?.trustedWorkspaces ?? []
  const cwd = trusted.find((d) => fs.existsSync(d)) || home
  agyPending = new Promise<string>((resolve) => {
    let out = ''
    let proc: pty.IPty
    try {
      proc = pty.spawn(bin, [], { cols: 120, rows: 40, cwd })
    } catch {
      resolve('')
      return
    }
    proc.onData((d) => (out += d))
    setTimeout(() => proc.write('/usage\r'), 2800)
    setTimeout(() => {
      try { proc.kill() } catch { /* sudah selesai */ }
      const text = out.replace(/\x1b\[[0-9;?<>= ]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').replace(/\r/g, '')
      if (text.trim()) agyCache = { at: Date.now(), text }
      resolve(text)
    }, 5200)
  }).finally(() => { agyPending = null })
  return agyPending
}

function agyWindow(text: string, label: string, minutes: number) {
  const pct = new RegExp(label + '[\\s\\S]*?([\\d.]+)%').exec(text)
  if (!pct) return null
  const ref = new RegExp(label + '[\\s\\S]*?Refreshes in\\s*([\\dhdms ]+)').exec(text)
  let secs: number | null = null
  if (ref) {
    secs = 0
    for (const m of ref[1].matchAll(/(\d+)\s*([dhms])/g)) secs += Number(m[1]) * ({ d: 86400, h: 3600, m: 60, s: 1 } as Record<string, number>)[m[2]]
  }
  return { used: 100 - Number(pct[1]), resetsAt: secs !== null ? now() + secs : null, minutes }
}

export async function cliProfile(agentId: string): Promise<any> {
  if (agentId === 'antigravity' || agentId === 'agy') {
    const p: any = syncProfile('antigravity')
    if (!p.isLoggedIn) return p
    const text = await scrapeAgy()
    const m = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?:[ \t]+\(([^)\n]+)\))?/.exec(text)
    if (m) {
      p.email = m[1]
      if (m[2]) { p.accountType = m[2]; p.planTier = m[2].replace(/^Google\s*/, '') }
    }
    return p
  }
  return syncProfile(agentId)
}

function syncProfile(agentId: string) {
  if (agentId === 'claude') {
    const cfg = readJson(path.join(home, '.claude.json'))
    const creds = readJson(path.join(home, '.claude', '.credentials.json'))
    const acc = cfg?.oauthAccount
    if (!acc && !creds?.claudeAiOauth) return base(agentId, '~/.claude.json')
    const raw = creds?.claudeAiOauth?.subscriptionType || String(acc?.organizationType || '').replace(/^claude_/, '')
    const plan = raw ? pretty(raw) : ''
    return {
      ...base(agentId, '~/.claude.json'),
      isLoggedIn: true,
      authMethod: 'subscription',
      name: acc?.displayName || '',
      email: acc?.emailAddress || '',
      planTier: plan,
      accountType: plan ? `Claude ${plan}` : 'Claude',
      statusDetails: 'Login Claude.ai aktif di Claude Code',
    }
  }
  if (agentId === 'codex') {
    const auth = readJson(path.join(home, '.codex', 'auth.json'))
    if (!auth) return base(agentId, '~/.codex/auth.json')
    let claims: any = null
    try {
      claims = JSON.parse(Buffer.from(String(auth.tokens?.id_token).split('.')[1], 'base64url').toString())
    } catch {
      /* bukan JWT */
    }
    const hasKey = !!auth.OPENAI_API_KEY
    if (!claims && !hasKey) return base(agentId, '~/.codex/auth.json')
    const plan = pretty(claims?.['https://api.openai.com/auth']?.chatgpt_plan_type || '')
    return {
      ...base(agentId, '~/.codex/auth.json'),
      isLoggedIn: true,
      authMethod: claims ? 'subscription' : 'api_key',
      name: claims?.name || '',
      email: claims?.email || '',
      planTier: plan,
      accountType: claims ? `ChatGPT${plan ? ' ' + plan : ''}` : 'OpenAI API',
      statusDetails: 'Login aktif di Codex CLI',
    }
  }
  if (agentId === 'opencode') {
    const auth = readJson(path.join(home, '.local', 'share', 'opencode', 'auth.json'))
    const providers = auth && typeof auth === 'object' ? Object.keys(auth) : []
    if (!providers.length) return base(agentId, 'opencode auth.json')
    return {
      ...base(agentId, 'opencode auth.json'),
      isLoggedIn: true,
      authMethod: 'multi_provider',
      planTier: 'Multi-provider',
      accountType: `OpenCode (${providers.length} provider)`,
      statusDetails: `Provider terhubung: ${providers.join(', ')}`,
    }
  }
  if (agentId === 'antigravity' || agentId === 'agy') {
    const g = path.join(home, '.gemini')
    const ok = [
      path.join(g, 'jetski-standalone-oauth-token'),
      path.join(g, 'antigravity-cli', 'jetski-standalone-oauth-token'),
    ].some((p) => fs.existsSync(p))
    return ok
      ? { ...base('antigravity', '~/.gemini'), isLoggedIn: true, authMethod: 'subscription', accountType: 'Akun Google (Antigravity)', statusDetails: 'Login Google aktif' }
      : base('antigravity', '~/.gemini')
  }
  return base(agentId, '-')
}

const win = (used: number, resetsAt: number | null, minutes: number) =>
  resetsAt !== null && resetsAt <= now() ? { used: 0, resetsAt: null, minutes } : { used, resetsAt, minutes }

export async function cliStats(agentId: string) {
  let five: any = null
  let long: any = null
  let inTok = 0
  let outTok = 0
  let source = '-'
  if (agentId === 'claude') {
    const u = readJson(path.join(home, '.claude.json'))?.cachedUsageUtilization?.utilization
    if (u?.five_hour) five = win(Number(u.five_hour.utilization), unix(u.five_hour.resets_at), 300)
    if (u?.seven_day) long = win(Number(u.seven_day.utilization), unix(u.seven_day.resets_at), 10080)
    source = '~/.claude.json cachedUsageUtilization'
  } else if (agentId === 'antigravity' || agentId === 'agy') {
    const text = await scrapeAgy()
    five = agyWindow(text, 'Five Hour Limit Remaining', 300)
    long = agyWindow(text, 'Weekly Limit Remaining', 10080)
    source = 'agy /usage'
  } else if (agentId === 'codex') {
    try {
      const walk = (d: string, out: string[]): string[] => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const f = path.join(d, e.name)
          if (e.isDirectory()) walk(f, out)
          else if (e.name.endsWith('.jsonl')) out.push(f)
        }
        return out
      }
      const files = walk(path.join(home, '.codex', 'sessions'), []).sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
      const last = files[files.length - 1]
      const line = fs.readFileSync(last, 'utf8').split('\n').reverse().find((l) => l.includes('"rate_limits"'))
      const p = JSON.parse(line!).payload
      for (const k of ['primary', 'secondary']) {
        const w = p.rate_limits?.[k]
        if (!w) continue
        const x = win(Number(w.used_percent), w.resets_at ?? null, w.window_minutes)
        if (w.window_minutes <= 300) five = x
        else long = x
      }
      inTok = p.info?.total_token_usage?.input_tokens ?? 0
      outTok = p.info?.total_token_usage?.output_tokens ?? 0
      source = 'Codex rollout ' + path.basename(last)
    } catch {
      /* belum ada sesi */
    }
  }
  const rem = (w: any) => (w ? Math.max(0, Math.min(100, Math.round(100 - w.used))) : null)
  return {
    agentId,
    quotaKnown: !!(five || long),
    weeklyLimitPercent: rem(long),
    fiveHourLimitPercent: rem(five),
    weeklyResetAt: long?.resetsAt ?? null,
    fiveHourResetAt: five?.resetsAt ?? null,
    weeklyWindowMinutes: long?.minutes ?? null,
    inputTokens: inTok,
    outputTokens: outTok,
    usedWeeklyTokens: inTok + outTok,
    totalCostUsd: null,
    sessionsCount: 0,
    messagesCount: 0,
    source,
    statusMessage: five || long ? `Sisa 5 jam: ${rem(five) ?? '—'}% · Sisa jendela panjang: ${rem(long) ?? '—'}%` : 'CLI belum melaporkan kuota',
  }
}
