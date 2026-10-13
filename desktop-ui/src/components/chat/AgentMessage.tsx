import { useEffect, useState } from 'react';
import { Terminal } from 'lucide-react';
import type { AppSettings, CodeEditChunk, MessageRecord } from '../../types/database';
import type { AgentProvider } from '../../types/agent';
import { getAgentIcon } from '../AgentIcons';
import { MarkdownContent } from '../ui/MarkdownContent';
import { CopyButton } from '../ui/CopyButton';
import { AgentWorkTimeline } from './work/AgentWorkTimeline';
import { CodeEditsCard } from './CodeEditsCard';
import { formatDuration } from './work/workSummary';

interface AgentMessageProps {
  msg: MessageRecord;
  isLight: boolean;
  settings: AppSettings | null;
  /** Dipakai untuk pesan lama yang belum menyimpan identitas agen. */
  fallbackAgent: AgentProvider;
  onOpenDiffReview: (files: CodeEditChunk[], activeIndex?: number) => void;
}

const WIDTH = { narrow: 'max-w-2xl', default: 'max-w-4xl', wide: 'max-w-5xl' } as const;

/** Detik berjalan selama pesan masih `running` (untuk timer & durasi langkah). */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Jawaban agen: identitas agen, panel proses kerja, jawaban Markdown, perubahan kode, dan bilah aksi (salin). */
export function AgentMessage({
  msg,
  isLight,
  settings,
  fallbackAgent,
  onOpenDiffReview,
}: AgentMessageProps) {
  const running = msg.status === 'running';
  const now = useTicker(running);
  const agentId = msg.agentId || fallbackAgent.id;
  const agentName = msg.agentName || fallbackAgent.name;
  const duration = msg.startedAt && msg.finishedAt ? formatDuration(msg.finishedAt - msg.startedAt) : '';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';

  return (
    <div className={`group w-full ${WIDTH[settings?.conversationWidth ?? 'default']} space-y-3`}>
      <div className="flex items-center gap-2">
        <span className={`w-6 h-6 rounded-lg grid place-items-center border ${isLight ? 'bg-white border-slate-200' : 'bg-white/[0.04] border-white/[0.08]'}`}>
          {getAgentIcon(agentId, 'w-3.5 h-3.5')}
        </span>
        <span className={`text-[13px] font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>{agentName}</span>
        {msg.modelName && <span className={`text-[11.5px] truncate ${muted}`}>{msg.modelName}</span>}
      </div>

      <AgentWorkTimeline
        msg={msg}
        isLight={isLight}
        now={now}
        verbose={settings?.verboseAgentChat ?? false}
        onOpenDiff={onOpenDiffReview}
      />

      {msg.content && (
        <div className="px-0.5">
          <MarkdownContent content={msg.content} isLight={isLight} />
          {running && <span className={`soraja-caret ${isLight ? 'bg-blue-600' : 'bg-cyan-400'}`} aria-hidden />}
        </div>
      )}

      {msg.toolCall && (
        <div className={`p-2.5 rounded-xl font-mono text-xs flex items-center gap-2 border ${isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-black/30 border-white/[0.07] text-slate-300'}`}>
          <Terminal className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
          <span className={muted}>{msg.toolCall.name}:</span>
          <span className="truncate">{msg.toolCall.command}</span>
        </div>
      )}

      {msg.codeEdits && msg.codeEdits.length > 0 && !running && (
        <CodeEditsCard edits={msg.codeEdits} isLight={isLight} onOpenDiffReview={onOpenDiffReview} />
      )}

      {!running && msg.content.trim() && (
        <div className="flex items-center gap-1 -ml-2 opacity-70 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <CopyButton text={() => msg.content} label="Salin jawaban" isLight={isLight} />
          <span className={`text-[10.5px] font-mono px-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            {msg.timestamp}
            {duration && ` · ${duration}`}
          </span>
        </div>
      )}
    </div>
  );
}
