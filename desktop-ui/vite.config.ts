import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import os from 'os'
import fs from 'fs'
import * as pty from 'node-pty'
import { cliProfile, cliStats } from './cliBridge.ts'
import { killPidTree, makeCwdResolver, registerHeadlessBridge } from './headlessBridge.ts'

function cliSyncPlugin(): Plugin {
  return {
    name: 'cli-sync-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/cli-profile') || req.url?.startsWith('/api/cli-stats')) {
          const isProfile = req.url.startsWith('/api/cli-profile')
          const u = new URL(req.url, 'http://localhost')
          const id = u.searchParams.get('agentId') || ''
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(await (isProfile ? cliProfile(id) : cliStats(id))))
          return
        }

        if (req.url === '/api/save-clipboard-image' && req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}')
              const { projectPath, imageBase64, filename } = data
              if (!imageBase64) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, error: 'Data gambar base64 kosong' }))
                return
              }

              const rootDir = projectPath && fs.existsSync(projectPath) ? projectPath : process.cwd()
              const imagesDir = path.join(rootDir, '.soraja', 'images')
              if (!fs.existsSync(imagesDir)) {
                fs.mkdirSync(imagesDir, { recursive: true })
              }

              const timestamp = Date.now()
              const safeName = filename ? filename.replace(/[^\w\.\-]/g, '_') : `lampiran_${timestamp}.png`
              const targetPath = path.join(imagesDir, safeName)

              const base64Clean = imageBase64.replace(/^data:image\/[a-zA-Z0-9\+\-\.]+;base64,/, '')
              fs.writeFileSync(targetPath, Buffer.from(base64Clean, 'base64'))

              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  success: true,
                  filePath: targetPath,
                  filename: safeName,
                })
              )
            } catch (err: any) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: err.message || 'Gagal menyimpan gambar' }))
            }
          })
          return
        }

        next()
      })

      function resolveWindowsCommand(command: string): string | undefined {
        if (!command) return undefined;
        if (path.isAbsolute(command) && fs.existsSync(command)) {
          return command;
        }
        const exts = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
        const dirs = (process.env.PATH ?? "").split(";").filter(Boolean);
        const names = /\.[^\\/]+$/.test(command) ? [command] : [...exts.map((e) => command + e), command];
        for (const dir of dirs) {
          for (const name of names) {
            const full = path.join(dir, name);
            if (fs.existsSync(full)) return full;
          }
        }
        // Known direct binary fallbacks on Windows
        if (command === 'agy' || command?.includes('agy')) {
          const agyExe = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'agy', 'bin', 'agy.exe');
          if (fs.existsSync(agyExe)) return agyExe;
        }
        if (command === 'opencode' || command?.includes('opencode')) {
          const ocDirectExe = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
          if (fs.existsSync(ocDirectExe)) return ocDirectExe;
          const ocCmd = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'opencode.cmd');
          if (fs.existsSync(ocCmd)) return ocCmd;
        }
        if (command === 'claude' || command?.includes('claude')) {
          const claudeDirectExe = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
          if (fs.existsSync(claudeDirectExe)) return claudeDirectExe;
          const claudeCmd = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm', 'claude.cmd');
          if (fs.existsSync(claudeCmd)) return claudeCmd;
        }
        if (command === 'kiro-cli') {
          for (const kiroExe of [
            path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Kiro-Cli', 'kiro-cli.exe'),
            path.join(os.homedir(), '.kiro', 'bin', 'kiro-cli.exe'),
          ]) {
            if (fs.existsSync(kiroExe)) return kiroExe;
          }
        }
        if (command === 'codex' || command?.includes('codex')) {
          const codexDirectExe = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm', 'node_modules', '@openai', 'codex', 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
          if (fs.existsSync(codexDirectExe)) return codexDirectExe;
          const codexCmd = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm', 'codex.cmd');
          if (fs.existsSync(codexCmd)) return codexCmd;
        }
        return undefined;
      }

      function resolveNpmShimTarget(cmdPath: string): { binary: string; args: string[] } | undefined {
        try {
          const text = fs.readFileSync(cmdPath, 'utf8');
          // 1. Direct .exe target in shim (e.g. "%dp0%\node_modules\...\tool.exe")
          const mExe = /(?:"%(?:~)?dp0%?\\+([^"]+\.exe)")/i.exec(text);
          if (mExe && mExe[1]) {
            const targetExe = path.join(path.dirname(cmdPath), mExe[1]);
            if (fs.existsSync(targetExe)) {
              return { binary: targetExe, args: [] };
            }
          }
          // 2. Node script target in shim (e.g. node "%dp0%\...\tool.js")
          const mJs = /(?:"%_prog%"|"%~dp0\\node\.exe"|\bnode(?:\.exe)?)\s+"%(?:~dp0|dp0%)\\+([^"]+)"\s+%\*/i.exec(text);
          if (mJs && mJs[1]) {
            const targetJs = path.join(path.dirname(cmdPath), mJs[1]);
            if (fs.existsSync(targetJs)) {
              return { binary: process.execPath, args: [targetJs] };
            }
          }
        } catch {
          return undefined;
        }
        return undefined;
      }

      // Browser dev (showDirectoryPicker) hanya mengirimkan nama folder (mis. "Agent Soraja Ai").
      const resolveCwd = makeCwdResolver(path.resolve(process.cwd(), '..'))

      // Chat GUI di browser: CLI asli dijalankan headless lewat jembatan ini (setara spawn_headless_agent).
      registerHeadlessBridge(server, {
        resolveCwd,
        resolveLaunch: (command) => {
          let binary = resolveWindowsCommand(command)
          if (!binary) return undefined
          let args: string[] = []
          if (/\.(cmd|bat)$/i.test(binary)) {
            const shim = resolveNpmShimTarget(binary)
            // Shim .cmd tanpa target terurai tidak aman dijalankan tanpa shell (prompt bisa disisipi perintah).
            if (!shim) return undefined
            binary = shim.binary
            args = shim.args
          }
          return { binary, args }
        },
      })

      // Interactive PTY streaming over WebSocket using real node-pty
      const activeSessions = new Map<string, pty.IPty>()
      const sessionCwd = new Map<string, string>()

      /** Mematikan satu sesi PTY beserta seluruh proses anaknya (tanpa zombie). */
      const killSession = (id: string, exitCode = -1) => {
        const proc = activeSessions.get(id)
        if (!proc) return
        activeSessions.delete(id)
        sessionCwd.delete(id)
        killPidTree(proc.pid, () => proc.kill())
        try {
          proc.kill()
        } catch {}
        server.ws.send('custom:pty-exit', { sessionId: id, exitCode })
      }

      // Server dev dimatikan → semua PTY ikut dimatikan
      server.httpServer?.once('close', () => [...activeSessions.keys()].forEach((id) => killSession(id)))

      server.ws.on('custom:pty-spawn', (payload: any) => {
        const { sessionId, agentExecutable, cwd, cols, rows, agentArgs, apiKey, envs } = payload || {}
        if (!sessionId) return

        // Idempoten: spawn ulang untuk sesi yang masih hidup diabaikan (mis. React StrictMode).
        // Membunuh proses lama di sini dulu menyebabkan onExit-nya menghapus sesi BARU → input hilang.
        if (activeSessions.has(sessionId)) return

        let targetBin = resolveWindowsCommand(agentExecutable) || agentExecutable;
        let args: string[] = Array.isArray(agentArgs) ? [...agentArgs] : [];

        if (/\.(cmd|bat)$/i.test(targetBin)) {
          const resolved = resolveNpmShimTarget(targetBin);
          if (resolved) {
            targetBin = resolved.binary;
            args = [...resolved.args, ...args];
          }
        }

        // Error 267 (ERROR_DIRECTORY): cwd harus berupa direktori absolut yang benar-benar ada di disk.
        const normalizedCwd = resolveCwd(cwd);

        // 1 direktori = 1 proses PTY: sesi lain di direktori yang sama dimatikan sebelum spawn baru.
        const cwdKey = path.resolve(normalizedCwd).toLowerCase()
        for (const [otherId, otherCwd] of sessionCwd) {
          if (otherId !== sessionId && otherCwd === cwdKey) killSession(otherId)
        }

        const ptyEnv: Record<string, string> = {
          ...(process.env as Record<string, string>),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          LANG: 'en_US.UTF-8',
          // Env tambahan dari buildInteractiveCommand (mis. aturan bahasa OpenCode)
          ...(envs && typeof envs === 'object' ? (envs as Record<string, string>) : {}),
        };

        if (apiKey) {
          ptyEnv.OPENCODE_API_KEY = apiKey;
          ptyEnv.DEEPSEEK_API_KEY = apiKey;
        }

        // Jika OpenCode dijalankan, pastikan kredensial auth.json otomatis diwariskan ke proses
        if (targetBin.toLowerCase().includes('opencode')) {
          const authPath = path.join(
            process.env.USERPROFILE || os.homedir(),
            '.local', 'share', 'opencode', 'auth.json'
          );
          if (fs.existsSync(authPath)) {
            try {
              const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
              if (authData['dwidasa']?.key) {
                ptyEnv.DWIDASA_API_KEY = authData['dwidasa'].key;
              }
              if (authData['opencode-go']?.key) {
                ptyEnv.OPENCODE_GO_API_KEY = authData['opencode-go'].key;
              }
              if (!apiKey && (authData['dwidasa']?.key || authData['opencode-go']?.key)) {
                ptyEnv.OPENCODE_API_KEY = authData['dwidasa']?.key || authData['opencode-go']?.key;
              }
            } catch {}
          }
        }

        try {
          const ptyProcess = pty.spawn(targetBin, args, {
            name: 'xterm-256color',
            cols: cols || 100,
            rows: rows || 24,
            cwd: normalizedCwd,
            env: ptyEnv,
          });

          ptyProcess.onData((data: string) => {
            if (activeSessions.get(sessionId) !== ptyProcess) return
            server.ws.send('custom:pty-output', {
              sessionId,
              data,
            });
          });

          ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
            // Hanya pemilik sesi saat ini yang boleh melaporkan exit & menghapus entri sesi
            if (activeSessions.get(sessionId) !== ptyProcess) return
            activeSessions.delete(sessionId)
            sessionCwd.delete(sessionId)
            server.ws.send('custom:pty-exit', {
              sessionId,
              exitCode,
            });
          });

          activeSessions.set(sessionId, ptyProcess);
          sessionCwd.set(sessionId, cwdKey);
        } catch (e) {
          server.ws.send('custom:pty-output', {
            sessionId,
            data: `\r\n\x1b[31m[Web PTY Error]: Gagal spawn ${targetBin}: ${String(e)}\x1b[0m\r\n`,
          });
        }
      })

      server.ws.on('custom:pty-input', (payload: any) => {
        const { sessionId, data } = payload || {}
        const ptyProc = activeSessions.get(sessionId)
        if (ptyProc && data) {
          ptyProc.write(data)
        }
      })

      server.ws.on('custom:pty-resize', (payload: any) => {
        const { sessionId, cols, rows } = payload || {}
        const ptyProc = activeSessions.get(sessionId)
        if (ptyProc && cols && rows) {
          try {
            ptyProc.resize(cols, rows)
          } catch {}
        }
      })

      server.ws.on('custom:pty-close', (payload: any) => {
        const { sessionId } = payload || {}
        killSession(sessionId, 0)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cliSyncPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    // Agen CLI menulis berkas ke proyek (termasuk gambar tempelan & build); perubahan itu
    // tidak boleh memicu full-reload webview yang mereset sesi terminal.
    watch: {
      ignored: ['**/.soraja/**', '**/dist/**', '**/target/**', '**/.git/**', '**/node_modules/**', '**/*.log'],
    },
  },
})
