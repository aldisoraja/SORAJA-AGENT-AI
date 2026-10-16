/**
 * rpcHeadless.ts
 * Menjalankan CLI agen dalam mode protokol JSON-RPC (Codex app-server, OpenCode/Kiro ACP) untuk Chat GUI mode aman:
 * proses dispawn dengan stdin terbuka, driver menulis lewat IPC `write_headless_agent_stdin`, dan permintaan
 * izin diteruskan ke modal HITL lewat `hitlBus`. Spesifikasi: specs/agent-protocols.md §7, specs/ipc-contracts.md §2.
 */
import { invoke } from '@tauri-apps/api/core';
import { emitSessionEvents, registerSessionAgent } from './agentStreamParser';
import { askPermission } from './hitlBus';
import { buildRpcCommand, type CliLaunchOptions } from './cli/agentCommands';
import { createCodexAppServerDriver } from './cli/codexAppServer';
import { createAcpDriver } from './cli/acpDriver';
import type { RpcDriverIo } from './cli/jsonRpcPeer';

/** Penulis stdin berurutan: IPC async bisa tiba tidak berurutan bila tidak dirantai. */
function stdinWriter(sessionId: string) {
  let chain: Promise<unknown> = Promise.resolve();
  const push = (data: string, close: boolean) => {
    chain = chain
      .then(() => invoke('write_headless_agent_stdin', { sessionId, data, close }))
      .catch((err) => console.warn('Gagal menulis ke stdin CLI:', err));
  };
  return { write: (line: string) => push(`${line}\n`, false), close: () => push('', true) };
}

export interface RpcSpawnOptions extends CliLaunchOptions {
  sessionId: string;
}

export async function spawnRpcAgentSession(o: RpcSpawnOptions): Promise<void> {
  const command = buildRpcCommand(o);
  const writer = stdinWriter(o.sessionId);
  const io: RpcDriverIo = {
    ...writer,
    emit: (events) => emitSessionEvents(o.sessionId, events),
    ask: (req) => askPermission({ ...req, sessionId: o.sessionId }),
  };
  const driver =
    o.agentId === 'codex'
      ? createCodexAppServerDriver(
          {
            cwd: o.cwd,
            prompt: command.prompt,
            modelId: command.modelId,
            effort: o.effort,
            developerInstructions: command.instructions,
            threadId: o.cliSessionId,
            imagePaths: o.imagePaths,
          },
          io
        )
      : createAcpDriver(
          o.agentId === 'kiro' ? 'kiro' : 'opencode',
          {
            cwd: o.cwd,
            prompt: command.prompt,
            modelId: command.modelId,
            sessionId: o.cliSessionId,
            filePaths: [...(o.imagePaths ?? []), ...(o.filePaths ?? [])],
          },
          io
        );

  registerSessionAgent(o.sessionId, o.agentId, driver.parse);
  await invoke('spawn_headless_agent', {
    sessionId: o.sessionId,
    agent: o.agentId,
    agentExecutable: command.executable,
    agentArgs: command.args,
    cwd: o.cwd,
    envs: command.envs,
    stdinPipe: true,
  });
  void driver.start();
}
