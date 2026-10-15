/**
 * headlessBridge.ts — jembatan DEV (Vite) agar mode Chat GUI di browser menjalankan CLI agen asli
 * secara headless (`claude -p ... --output-format stream-json`, dst.), setara IPC `spawn_headless_agent`.
 *
 * Protokol (HMR WebSocket Vite), nama event server→klien sama dengan event Tauri (specs/ipc-contracts.md §6):
 *   klien → server : `custom:headless-spawn` { sessionId, agentId, agentArgs, cwd, envs }
 *                    `custom:headless-stop`  { sessionId }
 *   server → klien : `agent:session_start` { sessionId, agent, executable, pid }
 *                    `agent:token_stream`  { sessionId, chunk }   (1 baris stdout/stderr + "\n")
 *                    `agent:session_end`   { sessionId, exitCode, summary }
 *
 * Keamanan: executable TIDAK diambil dari klien — hanya 4 CLI terdaftar yang bisa dijalankan.
 */
import { spawn, execFile, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { ViteDevServer } from 'vite'
import { listCliModels } from './modelsBridge.ts'

export interface LaunchTarget {
  binary: string
  args: string[]
}

interface BridgeDeps {
  /** Menemukan binary CLI (PATH, shim npm, lokasi instalasi bawaan). */
  resolveLaunch: (command: string) => LaunchTarget | undefined
  /** Menormalkan cwd menjadi direktori absolut yang ada di disk. */
  resolveCwd: (cwd?: string) => string
}

const CLI_EXECUTABLES: Record<string, { name: string; executable: string }> = {
  claude: { name: 'Claude Code', executable: 'claude' },
  codex: { name: 'OpenAI Codex', executable: 'codex' },
  opencode: { name: 'OpenCode', executable: 'opencode' },
  kiro: { name: 'Kiro', executable: 'kiro-cli' },
  antigravity: { name: 'Antigravity', executable: 'agy' },
  agy: { name: 'Antigravity', executable: 'agy' },
}

/** Normalisasi cwd dari browser: showDirectoryPicker hanya memberi nama folder, bukan path absolut. */
export function makeCwdResolver(repoRoot: string) {
  return (cwd?: string): string => {
    const cleaned = cwd ? path.normalize(String(cwd).trim().replace(/^"+|"+$/g, '')) : repoRoot
    try {
      if (fs.existsSync(cleaned) && fs.statSync(cleaned).isDirectory()) return cleaned
    } catch {
      // jatuh ke pencarian berdasarkan nama
    }
    const raw = String(cwd || '').trim().toLowerCase()
    if (raw && path.basename(repoRoot).toLowerCase() === raw) return repoRoot
    const child = raw ? path.join(repoRoot, raw) : ''
    if (child && fs.existsSync(child) && fs.statSync(child).isDirectory()) return child
    return fs.existsSync(repoRoot) ? repoRoot : process.cwd()
  }
}

/** Mematikan proses beserta seluruh proses anaknya (agy.exe/claude.exe dan turunannya), agar tidak ada zombie. */
export function killPidTree(pid: number | undefined, fallback?: () => void): void {
  if (!pid) return
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {})
  } else {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      fallback?.()
    }
  }
}

function killTree(proc: ChildProcess): void {
  killPidTree(proc.pid, () => proc.kill('SIGTERM'))
}

/** Memecah stream menjadi baris utuh; sisa yang belum diakhiri newline ditahan sampai `flush`. */
function lineEmitter(emit: (line: string) => void) {
  let rest = ''
  return {
    push(data: Buffer) {
      const parts = (rest + data.toString('utf8')).split('\n')
      rest = parts.pop() ?? ''
      for (const line of parts) emit(line.replace(/\r$/, ''))
    },
    flush() {
      if (rest) emit(rest.replace(/\r$/, ''))
      rest = ''
    },
  }
}

export function registerHeadlessBridge(server: ViteDevServer, deps: BridgeDeps): void {
  const running = new Map<string, ChildProcess>()

  // Status instalasi CLI untuk browser (setara IPC `get_available_cli_agents`).
  server.middlewares.use((req, res, next) => {
    if (!req.url?.startsWith('/api/cli-installed')) return next()
    const list = ['antigravity', 'claude', 'codex', 'opencode', 'kiro'].map((id) => {
      const meta = CLI_EXECUTABLES[id]
      const target = deps.resolveLaunch(meta.executable)
      return { id, name: meta.name, executable: meta.executable, is_installed: !!target, path: target?.binary ?? null }
    })
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(list))
  })

  // Lampiran Chat GUI → `<proyek>/.soraja/attachments/<pesan>/` (setara IPC `save_chat_attachment`).
  server.middlewares.use((req, res, next) => {
    if (req.url !== '/api/save-chat-attachment' || req.method !== 'POST') return next()
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const reply = (status: number, body: Record<string, unknown>) => {
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
      }
      try {
        const { projectPath, messageId, fileName, dataBase64 } = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        const safe = (v: unknown, fb: string) => String(v ?? '').replace(/[^\w.-]/g, '_').replace(/^\.+|\.+$/g, '').slice(0, 120) || fb
        const project = deps.resolveCwd(projectPath)
        const sorajaDir = path.join(project, '.soraja')
        const dir = path.join(sorajaDir, 'attachments', safe(messageId, 'pesan'))
        fs.mkdirSync(dir, { recursive: true })
        const ignore = path.join(sorajaDir, '.gitignore')
        if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n')
        const payload = String(dataBase64 || '')
        const bytes = Buffer.from(payload.includes(',') ? payload.slice(payload.indexOf(',') + 1) : payload, 'base64')
        if (bytes.length === 0) return reply(400, { error: 'Data lampiran kosong' })
        if (bytes.length > 25 * 1024 * 1024) return reply(413, { error: 'Lampiran melebihi 25 MB' })
        const filePath = path.join(dir, safe(fileName, 'lampiran.bin'))
        fs.writeFileSync(filePath, bytes)
        reply(200, { filePath })
      } catch (err) {
        reply(500, { error: String(err) })
      }
    })
  })

  // Daftar model per agen, sama dengan menu `/model` CLI (setara IPC `get_agent_models`).
  server.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith('/api/cli-models')) return next()
    const agentId = new URL(req.url, 'http://localhost').searchParams.get('agentId') || ''
    const exe = CLI_EXECUTABLES[agentId]?.executable
    const models = await listCliModels(agentId, exe ? deps.resolveLaunch(exe) : undefined)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(models))
  })

  server.ws.on('custom:headless-spawn', (payload: any) => {
    const { sessionId, agentId, agentArgs, cwd, envs } = payload || {}
    if (!sessionId || running.has(sessionId)) return

    const send = (event: string, data: Record<string, unknown>) => server.ws.send(event, { sessionId, ...data })
    const finish = (exitCode: number, summary: string) => send('agent:session_end', { exitCode, summary })

    const meta = CLI_EXECUTABLES[String(agentId)]
    if (!meta) return finish(-1, `Agen CLI tidak dikenal: ${agentId}`)
    const target = deps.resolveLaunch(meta.executable)
    if (!target) return finish(-1, `CLI ${meta.executable} tidak ditemukan di komputer ini.`)

    const args = [...target.args, ...(Array.isArray(agentArgs) ? agentArgs.map(String) : [])]
    const extraEnv: Record<string, string> = {}
    if (envs && typeof envs === 'object') {
      for (const [k, v] of Object.entries(envs)) if (typeof v === 'string') extraEnv[k] = v
    }

    let proc: ChildProcess
    try {
      proc = spawn(target.binary, args, {
        cwd: deps.resolveCwd(cwd),
        env: { ...process.env, ...extraEnv },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (err) {
      return finish(-1, `Gagal menjalankan ${meta.executable}: ${String(err)}`)
    }
    running.set(sessionId, proc)

    let ended = false
    const end = (exitCode: number, summary: string) => {
      if (ended) return
      ended = true
      running.delete(sessionId)
      stdout.flush()
      stderr.flush()
      finish(exitCode, summary)
    }
    const emitLine = (line: string) => send('agent:token_stream', { chunk: `${line}\n` })
    const stdout = lineEmitter(emitLine)
    const stderr = lineEmitter(emitLine)

    proc.stdout?.on('data', (d: Buffer) => stdout.push(d))
    proc.stderr?.on('data', (d: Buffer) => stderr.push(d))
    proc.on('error', (err) => end(-1, `Gagal menjalankan ${meta.executable}: ${err.message}`))
    proc.on('close', (code) =>
      end(code ?? -1, code === 0 ? 'Selesai' : `${meta.executable} berhenti dengan exit code ${code ?? 'tidak diketahui'}`)
    )

    if (proc.pid) send('agent:session_start', { agent: String(agentId), executable: target.binary, pid: proc.pid })
  })

  server.ws.on('custom:headless-stop', (payload: any) => {
    const proc = running.get(payload?.sessionId)
    if (proc) killTree(proc)
  })

  server.httpServer?.once('close', () => running.forEach(killTree))
}
