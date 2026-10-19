import { useState, type ReactNode } from 'react';
import {
  ChevronDown,
  CircleCheck,
  CircleStop,
  CircleX,
  FilePen,
  FileText,
  Globe,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
  SquareTerminal,
} from 'lucide-react';
import type { CodeEditChunk, MessageRecord } from '../../../types/database';
import { TimelineStep } from './TimelineStep';
import { StepGroup } from './StepGroup';
import { RunInfoChips } from './RunInfoChips';
import { DiffStat } from './FileVisuals';
import { activityLabel, countSteps, diffForStep, displaySteps, formatClock, formatDuration, groupSteps, mergeFileEdits } from './workSummary';

interface AgentWorkTimelineProps {
  msg: MessageRecord;
  isLight: boolean;
  /** Waktu sekarang (berdetak tiap detik saat agen bekerja). */
  now: number;
  verbose: boolean;
  onOpenDiff?: (files: CodeEditChunk[], index?: number) => void;
}

function Stat({ icon, value, title, isLight, tone }: { icon: ReactNode; value: number; title: string; isLight: boolean; tone?: string }) {
  if (!value) return null;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 text-[11px] font-medium tabular-nums ${tone ?? (isLight ? 'text-slate-500' : 'text-slate-400')}`}
    >
      {icon}
      {value}
    </span>
  );
}

/** Panel "Proses kerja": status live, statistik, timeline langkah (dikelompokkan), info eksekusi, dan log CLI. */
export function AgentWorkTimeline({ msg, isLight, now, verbose, onOpenDiff }: AgentWorkTimelineProps) {
  const running = msg.status === 'running';
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const open = manualOpen ?? running;

  const steps = displaySteps(msg);
  const counts = countSteps(steps, msg.codeEdits);
  const items = groupSteps(mergeFileEdits(steps));
  const logs = msg.logs || [];
  const elapsed = msg.startedAt ? (msg.finishedAt ?? now) - msg.startedAt : 0;
  const hasFooter = !!msg.runInfo || !!msg.usage || logs.length > 0;

  if (!running && steps.length === 0 && !hasFooter) return null;

  const accent = isLight ? 'text-blue-600' : 'text-cyan-400';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const edits = msg.codeEdits || [];
  const openChunk = (chunk: CodeEditChunk) => {
    const index = edits.indexOf(chunk);
    onOpenDiff?.(index >= 0 ? edits : [chunk], Math.max(0, index));
  };

  let statusIcon: ReactNode;
  let title: string;
  let tile: string;
  if (running) {
    statusIcon = <Loader2 className={`w-4 h-4 animate-spin ${accent}`} />;
    title = activityLabel(steps, !!msg.content.trim());
    tile = isLight ? 'bg-blue-50 border-blue-200' : 'bg-cyan-500/10 border-cyan-500/25';
  } else if (msg.status === 'error') {
    statusIcon = <CircleX className="w-4 h-4 text-rose-500" />;
    title = 'Berhenti dengan galat';
    tile = isLight ? 'bg-rose-50 border-rose-200' : 'bg-rose-500/10 border-rose-500/25';
  } else if (msg.status === 'stopped') {
    statusIcon = <CircleStop className="w-4 h-4 text-amber-500" />;
    title = 'Dihentikan';
    tile = isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/25';
  } else if (msg.status === 'done') {
    statusIcon = <CircleCheck className="w-4 h-4 text-emerald-500" />;
    title = counts.denied > 0 ? 'Selesai, sebagian aksi ditolak' : 'Selesai';
    tile = isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20';
  } else {
    statusIcon = <Sparkles className={`w-4 h-4 ${accent}`} />;
    title = 'Proses kerja';
    tile = isLight ? 'bg-white border-slate-200' : 'bg-white/[0.04] border-white/[0.08]';
  }

  return (
    <div
      className={`relative rounded-2xl border overflow-hidden transition-colors ${
        isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-white/[0.015] border-white/[0.07]'
      } ${running ? (isLight ? 'shadow-sm shadow-blue-500/5' : 'shadow-lg shadow-cyan-950/20') : ''}`}
    >
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        aria-expanded={open}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer transition-colors ${
          isLight ? 'hover:bg-slate-100/70' : 'hover:bg-white/[0.02]'
        }`}
      >
        <span className={`shrink-0 w-8 h-8 rounded-xl grid place-items-center border ${tile}`}>{statusIcon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2 min-w-0">
            <span className={`text-[13px] font-semibold truncate ${isLight ? 'text-slate-800' : 'text-slate-100'} ${running ? 'soraja-shimmer' : ''}`}>
              {title}
            </span>
            {elapsed >= 1000 && (
              <span className={`text-[11px] font-mono shrink-0 tabular-nums ${muted}`}>
                {running ? formatClock(elapsed) : formatDuration(elapsed)}
              </span>
            )}
          </span>
          <span className="flex items-center gap-3 mt-0.5 min-h-[16px]">
            <Stat isLight={isLight} value={counts.reads} title="Berkas dibaca" icon={<FileText className="w-3 h-3" />} />
            <Stat isLight={isLight} value={counts.searches} title="Pencarian" icon={<Search className="w-3 h-3" />} />
            <Stat isLight={isLight} value={counts.web} title="Akses web" icon={<Globe className="w-3 h-3" />} />
            <Stat isLight={isLight} value={counts.commands} title="Perintah terminal" icon={<SquareTerminal className="w-3 h-3" />} />
            <Stat isLight={isLight} value={counts.edits} title="Berkas diubah" icon={<FilePen className="w-3 h-3" />} />
            <Stat
              isLight={isLight}
              value={counts.denied}
              title="Aksi ditolak mode aman"
              tone={isLight ? 'text-amber-600' : 'text-amber-400'}
              icon={<ShieldAlert className="w-3 h-3" />}
            />
            <Stat isLight={isLight} value={counts.errors} title="Langkah gagal" tone="text-rose-500" icon={<CircleX className="w-3 h-3" />} />
            {steps.length === 0 && <span className={`text-[11px] ${muted}`}>{running ? 'Menyiapkan sesi agen' : 'Tanpa langkah tool'}</span>}
          </span>
        </span>
        {counts.additions + counts.deletions > 0 && <DiffStat additions={counts.additions} deletions={counts.deletions} />}
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${muted} ${open ? 'rotate-180' : ''}`} />
      </button>

      {running && <div className="soraja-progress absolute left-0 right-0 top-0 h-[2px]" aria-hidden />}

      {open && (
        <div className={`px-3.5 pb-3 pt-1 border-t ${isLight ? 'border-slate-200/80' : 'border-white/[0.05]'}`}>
          {items.length > 0 ? (
            <ol
              className={`relative mt-2.5 space-y-1.5 before:absolute before:left-[11.5px] before:top-4 before:bottom-4 before:w-px ${
                isLight ? 'before:bg-slate-200' : 'before:bg-white/[0.07]'
              }`}
            >
              {items.map((item) =>
                item.kind === 'group' ? (
                  <StepGroup key={item.key} steps={item.steps} isLight={isLight} now={now} verbose={verbose} />
                ) : (
                  <TimelineStep
                    key={item.key}
                    step={item.step}
                    isLight={isLight}
                    now={now}
                    verbose={verbose}
                    diff={item.step.type === 'edited' ? diffForStep(item.step, msg.codeEdits) : undefined}
                    onOpenDiff={onOpenDiff ? openChunk : undefined}
                  />
                )
              )}
            </ol>
          ) : running ? (
            <div className="mt-3 space-y-2" aria-label={`Menunggu respons pertama dari ${msg.agentName || 'agen'}`}>
              {[72, 48].map((w) => (
                <div key={w} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-lg animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/[0.05]'}`} />
                  <span className={`h-2.5 rounded-full animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/[0.05]'}`} style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          ) : null}

          {hasFooter && (
            <div className={`mt-3 pt-2.5 border-t ${isLight ? 'border-slate-200/80' : 'border-white/[0.05]'}`}>
              <RunInfoChips msg={msg} isLight={isLight} showLogs={showLogs} onToggleLogs={() => setShowLogs((v) => !v)} />
            </div>
          )}

          {showLogs && logs.length > 0 && (
            <pre
              className={`mt-2 max-h-56 overflow-auto rounded-lg border px-3 py-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap break-all ${
                isLight ? 'bg-white border-slate-200 text-slate-600' : 'bg-black/35 border-white/[0.06] text-slate-400'
              }`}
            >
              {logs.join('\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
