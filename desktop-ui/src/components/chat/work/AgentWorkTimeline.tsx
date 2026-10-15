import { useState, type ReactNode } from 'react';
import {
  ChevronDown,
  CircleCheck,
  CircleStop,
  CircleX,
  Coins,
  FolderOpen,
  Gauge,
  Loader2,
  Paperclip,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { CodeEditChunk, MessageRecord } from '../../../types/database';
import { TimelineStep } from './TimelineStep';
import {
  EFFORT_LABEL,
  activityLabel,
  baseName,
  countSteps,
  displaySteps,
  formatClock,
  formatDuration,
  formatCredits,
  formatTokens,
  summaryParts,
} from './workSummary';

interface AgentWorkTimelineProps {
  msg: MessageRecord;
  isLight: boolean;
  /** Waktu sekarang (berdetak tiap detik saat agen bekerja). */
  now: number;
  verbose: boolean;
  onOpenDiff?: (files: CodeEditChunk[], index?: number) => void;
}

function Chip({ icon, children, title, isLight }: { icon: ReactNode; children: ReactNode; title?: string; isLight: boolean }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] border max-w-full ${
        isLight ? 'bg-white border-slate-200 text-slate-600' : 'bg-white/[0.03] border-white/[0.07] text-slate-400'
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Panel "Proses kerja": status live, ringkasan, timeline langkah, info eksekusi, dan log CLI. */
export function AgentWorkTimeline({ msg, isLight, now, verbose, onOpenDiff }: AgentWorkTimelineProps) {
  const running = msg.status === 'running';
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const open = manualOpen ?? running;

  const steps = displaySteps(msg);
  const counts = countSteps(steps);
  const parts = summaryParts(counts);
  const info = msg.runInfo;
  const logs = msg.logs || [];
  const elapsed = msg.startedAt ? (msg.finishedAt ?? now) - msg.startedAt : 0;

  if (!running && steps.length === 0 && !info && logs.length === 0) return null;

  const accent = isLight ? 'text-blue-600' : 'text-cyan-400';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';

  let statusIcon: ReactNode;
  let title: string;
  if (running) {
    statusIcon = <Loader2 className={`w-4 h-4 animate-spin ${accent}`} />;
    title = activityLabel(steps, !!msg.content.trim());
  } else if (msg.status === 'error') {
    statusIcon = <CircleX className="w-4 h-4 text-rose-500" />;
    title = 'Berhenti dengan galat';
  } else if (msg.status === 'stopped') {
    statusIcon = <CircleStop className="w-4 h-4 text-amber-500" />;
    title = 'Dihentikan';
  } else if (msg.status === 'done') {
    statusIcon = <CircleCheck className="w-4 h-4 text-emerald-500" />;
    title = 'Selesai';
  } else {
    statusIcon = <Sparkles className={`w-4 h-4 ${accent}`} />;
    title = 'Proses kerja';
  }

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-colors ${
        isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-white/[0.015] border-white/[0.07]'
      } ${running ? (isLight ? 'shadow-sm shadow-blue-500/5' : 'shadow-lg shadow-cyan-950/20') : ''}`}
    >
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        aria-expanded={open}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left cursor-pointer transition-colors ${
          isLight ? 'hover:bg-slate-100/80' : 'hover:bg-white/[0.02]'
        }`}
      >
        <span className="shrink-0">{statusIcon}</span>
        <span className="flex items-baseline gap-2 min-w-0 flex-1">
          <span className={`text-[13px] font-semibold truncate ${isLight ? 'text-slate-800' : 'text-slate-100'} ${running ? 'soraja-shimmer' : ''}`}>
            {title}
          </span>
          {elapsed >= 1000 && (
            <span className={`text-[11px] font-mono shrink-0 ${muted}`}>
              {running ? formatClock(elapsed) : formatDuration(elapsed)}
            </span>
          )}
          {!running && parts.length > 0 && (
            <span className={`text-[11px] truncate hidden sm:inline ${muted}`}>· {parts.join(' · ')}</span>
          )}
        </span>
        {counts.edits > 0 && (
          <span className="shrink-0 font-mono text-[11px] font-semibold">
            <span className="text-emerald-500">+{counts.additions}</span>{' '}
            <span className="text-rose-500">−{counts.deletions}</span>
          </span>
        )}
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${muted} ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`px-3.5 pb-3 pt-1 border-t ${isLight ? 'border-slate-200/80' : 'border-white/[0.05]'}`}>
          {steps.length > 0 ? (
            <ol
              className={`relative mt-2 space-y-1.5 before:absolute before:left-[10.5px] before:top-3 before:bottom-3 before:w-px ${
                isLight ? 'before:bg-slate-200' : 'before:bg-white/[0.08]'
              }`}
            >
              {steps.map((step, idx) => (
                <TimelineStep
                  key={step.toolId ?? `${step.type}-${idx}`}
                  step={step}
                  isLight={isLight}
                  now={now}
                  verbose={verbose}
                  onOpenDiff={onOpenDiff}
                />
              ))}
            </ol>
          ) : running ? (
            <p className={`mt-2 text-[12px] ${muted}`}>Menunggu respons pertama dari {msg.agentName || 'agen'}…</p>
          ) : null}

          {(info || msg.usage || logs.length > 0) && (
            <div className={`mt-3 pt-2.5 border-t flex flex-wrap items-center gap-1.5 ${isLight ? 'border-slate-200/80' : 'border-white/[0.05]'}`}>
              {info?.workspace && (
                <Chip isLight={isLight} title={info.workspace} icon={<FolderOpen className="w-3 h-3" />}>
                  {baseName(info.workspace)}
                </Chip>
              )}
              {info?.permission && (
                <Chip isLight={isLight} icon={<ShieldCheck className="w-3 h-3" />}>
                  {info.permission === 'safe' ? 'Mode aman' : 'Otonom'}
                </Chip>
              )}
              {info?.effort && (
                <Chip isLight={isLight} title="Kedalaman penalaran Chat GUI" icon={<Gauge className="w-3 h-3" />}>
                  Penalaran {EFFORT_LABEL[info.effort]}
                </Chip>
              )}
              {!!info?.attachmentCount && (
                <Chip isLight={isLight} icon={<Paperclip className="w-3 h-3" />}>
                  {info.attachmentCount} lampiran dibaca agen
                </Chip>
              )}
              {info?.resumedSession && (
                <Chip isLight={isLight} title={info.resumedSession} icon={<Sparkles className="w-3 h-3" />}>
                  Melanjutkan sesi
                </Chip>
              )}
              {info?.fallback && (
                <Chip isLight={isLight} title={info.fallbackReason} icon={<Sparkles className="w-3 h-3" />}>
                  Mode cadangan lokal
                </Chip>
              )}
              {msg.usage && (
                <Chip
                  isLight={isLight}
                  title={
                    msg.usage.credits
                      ? `Kredit terpakai pada giliran ini (dilaporkan CLI): ${msg.usage.credits}. Ini pemakaian, bukan sisa kuota.`
                      : `${msg.usage.inputTokens.toLocaleString('id-ID')} token masuk · ${msg.usage.outputTokens.toLocaleString('id-ID')} token keluar`
                  }
                  icon={<Coins className="w-3 h-3" />}
                >
                  {[
                    msg.usage.inputTokens + msg.usage.outputTokens > 0
                      ? `${formatTokens(msg.usage.inputTokens)} masuk · ${formatTokens(msg.usage.outputTokens)} keluar`
                      : '',
                    msg.usage.credits ? formatCredits(msg.usage.credits) : '',
                    msg.usage.costUsd ? `$${msg.usage.costUsd.toFixed(4)}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Chip>
              )}
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLogs((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] border cursor-pointer ${
                    isLight ? 'border-slate-200 text-slate-600 hover:bg-white' : 'border-white/[0.07] text-slate-400 hover:bg-white/[0.04]'
                  }`}
                >
                  <ScrollText className="w-3 h-3" />
                  {showLogs ? 'Sembunyikan log' : `Log CLI (${logs.length})`}
                </button>
              )}
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
