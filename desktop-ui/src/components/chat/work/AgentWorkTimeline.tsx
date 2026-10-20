import { useState, type ReactNode } from 'react';
import {
  ChevronRight,
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
import type { CodeEditChunk, MessageRecord, TrajectoryStep } from '../../../types/database';
import { MarkdownContent } from '../../ui/MarkdownContent';
import { TimelineStep } from './TimelineStep';
import { StepGroup } from './StepGroup';
import { RunInfoChips } from './RunInfoChips';
import { DiffStat } from './FileVisuals';
import {
  activityLabel,
  countSteps,
  diffForStep,
  formatClock,
  formatDuration,
  groupSteps,
  mergeFileEdits,
  usageHeadline,
  type StepItem,
} from './workSummary';

interface AgentWorkTimelineProps {
  msg: MessageRecord;
  /** Langkah proses kronologis (lihat `messageFlow`): tool + segmen penjelasan agen. */
  steps: TrajectoryStep[];
  isLight: boolean;
  /** Waktu sekarang (berdetak tiap detik saat agen bekerja). */
  now: number;
  verbose: boolean;
  onOpenDiff?: (files: CodeEditChunk[], index?: number) => void;
}

/** Potongan alur: paragraf penjelasan agen, atau rangkaian langkah tool di garis timeline. */
type Segment = { kind: 'text'; key: string; text: string } | { kind: 'steps'; key: string; items: StepItem[] };

function toSegments(items: StepItem[]): Segment[] {
  const segments: Segment[] = [];
  for (const item of items) {
    if (item.kind === 'step' && item.step.type === 'text') {
      segments.push({ kind: 'text', key: item.key, text: item.step.text || '' });
      continue;
    }
    const last = segments[segments.length - 1];
    if (last?.kind === 'steps') last.items.push(item);
    else segments.push({ kind: 'steps', key: `seg-${segments.length}`, items: [item] });
  }
  return segments;
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

/**
 * Proses kerja agen tanpa card: baris status (sekaligus tombol lipat) lalu alur kronologis tempat penjelasan
 * agen tampil tepat di bawah langkah yang mendahuluinya. Terbuka selama agen bekerja, dilipat otomatis setelah selesai.
 */
export function AgentWorkTimeline({ msg, steps, isLight, now, verbose, onOpenDiff }: AgentWorkTimelineProps) {
  const running = msg.status === 'running';
  // Pilihan buka/tutup manual hanya berlaku untuk status saat dipilih → saat agen selesai, proses kembali terlipat.
  const [manual, setManual] = useState<{ status?: string; open: boolean } | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const open = manual && manual.status === msg.status ? manual.open : running;
  const toggle = () => setManual({ status: msg.status, open: !open });

  const counts = countSteps(steps, msg.codeEdits);
  const items = groupSteps(mergeFileEdits(steps));
  const segments = toSegments(items);
  const logs = msg.logs || [];
  const elapsed = msg.startedAt ? (msg.finishedAt ?? now) - msg.startedAt : 0;
  const hasFooter = !!msg.runInfo || !!msg.usage || logs.length > 0;
  // Hanya setelah selesai: kebanyakan CLI melaporkan pemakaian di akhir giliran, angka di tengah proses tidak seragam.
  const usage = running ? undefined : usageHeadline(msg.usage);

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
    title = counts.denied > 0 ? 'Selesai, sebagian aksi ditolak' : 'Selesai';
  } else {
    statusIcon = <Sparkles className={`w-4 h-4 ${accent}`} />;
    title = 'Proses kerja';
  }

  const lastSegment = segments[segments.length - 1];

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title={open ? 'Lipat proses kerja' : 'Tampilkan proses kerja'}
        className={`group flex items-center gap-2 max-w-full min-h-[28px] -mx-1.5 px-1.5 rounded-lg text-left cursor-pointer transition-colors ${
          isLight ? 'hover:bg-slate-100/80' : 'hover:bg-white/[0.03]'
        }`}
      >
        <span className="shrink-0">{statusIcon}</span>
        <span className={`text-[12.5px] font-medium truncate ${isLight ? 'text-slate-700' : 'text-slate-200'} ${running ? 'soraja-shimmer' : ''}`}>
          {title}
        </span>
        {elapsed >= 1000 && (
          <span className={`text-[11px] font-mono shrink-0 tabular-nums ${muted}`}>
            {running ? formatClock(elapsed) : formatDuration(elapsed)}
          </span>
        )}
        {usage && (
          <span title={usage.title} className={`text-[11px] font-mono shrink-0 tabular-nums ${muted}`}>
            {usage.text}
          </span>
        )}
        <span className="flex items-center gap-2.5 shrink-0">
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
        </span>
        {counts.additions + counts.deletions > 0 && <DiffStat additions={counts.additions} deletions={counts.deletions} />}
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${muted} ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {segments.map((seg) =>
            seg.kind === 'text' ? (
              <div key={seg.key} className="px-0.5">
                <MarkdownContent content={seg.text} isLight={isLight} />
                {running && seg === lastSegment && <span className={`soraja-caret ${isLight ? 'bg-blue-600' : 'bg-cyan-400'}`} aria-hidden />}
              </div>
            ) : (
              <ol
                key={seg.key}
                className={`relative space-y-1.5 before:absolute before:left-[11.5px] before:top-4 before:bottom-4 before:w-px ${
                  isLight ? 'before:bg-slate-200' : 'before:bg-white/[0.07]'
                }`}
              >
                {seg.items.map((item) =>
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
            )
          )}

          {running && segments.length === 0 && (
            <div className="space-y-2" aria-label={`Menunggu respons pertama dari ${msg.agentName || 'agen'}`}>
              {[72, 48].map((w) => (
                <div key={w} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-lg animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/[0.05]'}`} />
                  <span className={`h-2.5 rounded-full animate-pulse ${isLight ? 'bg-slate-200' : 'bg-white/[0.05]'}`} style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          )}

          {hasFooter && (
            <div className={`pt-2.5 border-t ${isLight ? 'border-slate-200/80' : 'border-white/[0.05]'}`}>
              <RunInfoChips msg={msg} isLight={isLight} showLogs={showLogs} onToggleLogs={() => setShowLogs((v) => !v)} />
            </div>
          )}

          {showLogs && logs.length > 0 && (
            <pre
              className={`max-h-56 overflow-auto rounded-lg border px-3 py-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap break-all ${
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
