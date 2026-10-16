import { listen } from '@tauri-apps/api/event';
import { createStreamParser, type StreamParser, type UiAgentEvent } from './cli/streamParsers';
import { isTauriRuntime, subscribeBridge } from './headlessTransport';

/**
 * Jembatan event Tauri mode Chat GUI → UiAgentEvent per sesi.
 * Event mentah: `agent:session_start`, `agent:token_stream`, `agent:session_end` (specs/ipc-contracts.md §6).
 * Pemetaan NDJSON per agen: specs/agent-protocols.md §3.
 */
export interface AgentStreamCallbacks {
  onSessionStart: (payload: { sessionId: string; agent?: string; pid: number }) => void;
  onEvent: (sessionId: string, event: UiAgentEvent) => void;
  onSessionEnd: (payload: { sessionId: string; exitCode: number; summary: string }) => void;
}

const sessionAgents = new Map<string, string>();
const sessionParsers = new Map<string, StreamParser>();
const sessionBuffers = new Map<string, string>();

/** Penerima event aktif (dipasang `setupAgentStreamListeners`) untuk event yang tidak datang dari stdout. */
const eventSinks = new Set<(sessionId: string, event: UiAgentEvent) => void>();

/**
 * Didaftarkan sebelum spawn agar baris pertama sudah tahu format agennya.
 * `parser` mengganti parser NDJSON bawaan (driver JSON-RPC Codex app-server / OpenCode ACP).
 */
export function registerSessionAgent(sessionId: string, agentId: string, parser?: StreamParser): void {
  sessionAgents.set(sessionId, agentId);
  sessionBuffers.delete(sessionId);
  if (parser) sessionParsers.set(sessionId, parser);
  else sessionParsers.delete(sessionId);
}

/** Event UI dari driver JSON-RPC yang lahir di luar baris stdout (id sesi, kegagalan handshake). */
export function emitSessionEvents(sessionId: string, events: UiAgentEvent[]): void {
  for (const ev of events) for (const sink of eventSinks) sink(sessionId, ev);
}

function parserFor(sessionId: string): StreamParser {
  let parser = sessionParsers.get(sessionId);
  if (!parser) {
    parser = createStreamParser(sessionAgents.get(sessionId) ?? 'claude');
    sessionParsers.set(sessionId, parser);
  }
  return parser;
}

function forget(sessionId: string): void {
  sessionAgents.delete(sessionId);
  sessionParsers.delete(sessionId);
  sessionBuffers.delete(sessionId);
}

export async function setupAgentStreamListeners(callbacks: AgentStreamCallbacks): Promise<() => void> {
  const sink = callbacks.onEvent;
  eventSinks.add(sink);
  const onStart = (payload: { sessionId: string; agent?: string; pid: number }) => {
    const { sessionId, agent } = payload;
    if (agent && !sessionAgents.has(sessionId)) sessionAgents.set(sessionId, agent);
    callbacks.onSessionStart(payload);
  };

  const onChunk = ({ sessionId, chunk }: { sessionId: string; chunk: string }) => {
    // Rust mengirim per baris, tetapi buffer tetap dijaga agar aman bila chunk terpotong.
    const buffered = (sessionBuffers.get(sessionId) ?? '') + chunk;
    const lines = buffered.split('\n');
    sessionBuffers.set(sessionId, lines.pop() ?? '');
    const parse = parserFor(sessionId);
    for (const line of lines) {
      for (const ev of parse(line)) callbacks.onEvent(sessionId, ev);
    }
  };

  const onEnd = (payload: { sessionId: string; exitCode: number; summary: string }) => {
    const { sessionId } = payload;
    const rest = sessionBuffers.get(sessionId);
    if (rest) {
      for (const ev of parserFor(sessionId)(rest)) callbacks.onEvent(sessionId, ev);
    }
    forget(sessionId);
    callbacks.onSessionEnd(payload);
  };

  // Browser dev: event datang dari jembatan Vite (headlessBridge.ts), bukan dari Tauri.
  if (!isTauriRuntime) {
    const unsubscribe = subscribeBridge({ onStart, onChunk, onEnd });
    return () => {
      eventSinks.delete(sink);
      unsubscribe();
    };
  }

  const unlistenStart = await listen<{ sessionId: string; agent?: string; pid: number }>(
    'agent:session_start',
    (event) => onStart(event.payload)
  );
  const unlistenStream = await listen<{ sessionId: string; chunk: string }>('agent:token_stream', (event) =>
    onChunk(event.payload)
  );
  const unlistenEnd = await listen<{ sessionId: string; exitCode: number; summary: string }>(
    'agent:session_end',
    (event) => onEnd(event.payload)
  );

  return () => {
    eventSinks.delete(sink);
    unlistenStart();
    unlistenStream();
    unlistenEnd();
  };
}
