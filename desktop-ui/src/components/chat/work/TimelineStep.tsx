import { useState, type ReactNode } from 'react';
import {
  Brain,
  ChevronRight,
  CircleX,
  FilePen,
  FileText,
  Globe,
  ListChecks,
  Loader2,
  MessageSquareText,
  Search,
  ShieldAlert,
  SquareTerminal,
  Wrench,
} from 'lucide-react';
import type { CodeEditChunk, TrajectoryStep } from '../../../types/database';
import { MarkdownContent } from '../../ui/MarkdownContent';
import { DiffStat, ExtBadge, FilePath } from './FileVisuals';
import { DiffPreview, OutputBlock, PlanList } from './StepDetails';
import { stepDuration } from './workSummary';

interface TimelineStepProps {
  step: TrajectoryStep;
  isLight: boolean;
  now: number;
  /** Buka blok penalaran yang sudah selesai secara default (Pengaturan → Tampilan proses berpikir). */
  verbose: boolean;
  /** Diff berkas untuk langkah "edited" (dari `MessageRecord.codeEdits`). */
  diff?: CodeEditChunk;
  onOpenDiff?: (chunk: CodeEditChunk) => void;
}

type Tone = { dark: string; light: string };

/** Ikon, kata kerja, dan warna tiap jenis langkah. Kelas warna ditulis utuh agar terdeteksi Tailwind. */
const STEP_META: Record<TrajectoryStep['type'], { Icon: typeof Brain; verb: string; tone: Tone }> = {
  thought: { Icon: Brain, verb: 'Berpikir', tone: { dark: 'text-violet-300 bg-violet-500/10 border-violet-500/20', light: 'text-violet-600 bg-violet-50 border-violet-200' } },
  analyzed: { Icon: FileText, verb: 'Membaca', tone: { dark: 'text-sky-300 bg-sky-500/10 border-sky-500/20', light: 'text-sky-600 bg-sky-50 border-sky-200' } },
  explored: { Icon: Search, verb: 'Mencari', tone: { dark: 'text-amber-300 bg-amber-500/10 border-amber-500/20', light: 'text-amber-600 bg-amber-50 border-amber-200' } },
  web: { Icon: Globe, verb: 'Menjelajah', tone: { dark: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20', light: 'text-indigo-600 bg-indigo-50 border-indigo-200' } },
  command: { Icon: SquareTerminal, verb: 'Menjalankan', tone: { dark: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', light: 'text-emerald-600 bg-emerald-50 border-emerald-200' } },
  edited: { Icon: FilePen, verb: 'Mengubah', tone: { dark: 'text-orange-300 bg-orange-500/10 border-orange-500/20', light: 'text-orange-600 bg-orange-50 border-orange-200' } },
  plan: { Icon: ListChecks, verb: 'Rencana kerja', tone: { dark: 'text-blue-300 bg-blue-500/10 border-blue-500/20', light: 'text-blue-600 bg-blue-50 border-blue-200' } },
  tool: { Icon: Wrench, verb: 'Memakai', tone: { dark: 'text-slate-300 bg-white/[0.04] border-white/[0.08]', light: 'text-slate-600 bg-slate-100 border-slate-200' } },
  text: { Icon: MessageSquareText, verb: 'Menjelaskan', tone: { dark: 'text-slate-300 bg-white/[0.04] border-white/[0.08]', light: 'text-slate-600 bg-slate-100 border-slate-200' } },
  running: { Icon: Loader2, verb: 'Memproses', tone: { dark: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20', light: 'text-cyan-600 bg-cyan-50 border-cyan-200' } },
};

/** Node ikon di garis timeline (berputar saat berjalan, merah saat gagal, kuning saat ditolak). */
export function StepNode({ type, status, isLight }: { type: TrajectoryStep['type']; status?: TrajectoryStep['status']; isLight: boolean }) {
  const meta = STEP_META[type] ?? STEP_META.tool;
  const failed = status === 'error';
  const denied = status === 'denied';
  const cls = failed
    ? isLight ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-rose-300 bg-rose-500/10 border-rose-500/25'
    : denied
      ? isLight ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-amber-300 bg-amber-500/10 border-amber-500/25'
      : isLight ? meta.tone.light : meta.tone.dark;
  return (
    <span
      className={`absolute left-0 top-[2px] w-6 h-6 rounded-lg grid place-items-center border ${cls} ${
        status === 'running' ? (isLight ? 'ring-4 ring-blue-500/10' : 'ring-4 ring-cyan-400/10') : ''
      }`}
    >
      {status === 'running' ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : failed ? (
        <CircleX className="w-3.5 h-3.5" />
      ) : denied ? (
        <ShieldAlert className="w-3.5 h-3.5" />
      ) : (
        <meta.Icon className="w-3.5 h-3.5" />
      )}
    </span>
  );
}

/** Satu langkah di timeline "Proses kerja": node ikon, kalimat aksi, meta, dan detail yang bisa dibuka. */
export function TimelineStep({ step, isLight, now, verbose, diff, onOpenDiff }: TimelineStepProps) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const running = step.status === 'running';
  const failed = step.status === 'error';
  const denied = step.status === 'denied';
  const meta = STEP_META[step.type] ?? STEP_META.tool;
  const duration = stepDuration(step, now);

  const isThought = step.type === 'thought';
  const isPlan = step.type === 'plan';
  const outputText = ['command', 'tool', 'web'].includes(step.type) || failed || denied ? step.output || '' : '';
  const hasDiff = step.type === 'edited' && !!diff && diff.diffLines.length > 0;
  const expandable = isThought ? !!step.thoughtContent?.trim() : hasDiff || !!outputText.trim();
  // Penalaran berjalan selalu terbuka; setelah selesai mengikuti preferensi. Rencana selalu tampil.
  const open = manualOpen ?? (isThought ? running || verbose : false);

  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const strong = isLight ? 'text-slate-800' : 'text-slate-200';
  const todos = step.todos || [];
  const doneTodos = todos.filter((t) => t.status === 'done').length;

  let object: ReactNode = null;
  if (isThought) {
    const preview = (step.thoughtContent || '').replace(/[#*_`>]/g, '').trim().split('\n').find(Boolean) || '';
    object = !open && preview ? <span className={`truncate italic ${muted}`}>{preview}</span> : null;
  } else if (step.type === 'analyzed' || step.type === 'edited') {
    const path = diff?.relativePath || step.label || step.file || '';
    object = (
      <>
        <ExtBadge path={path} isLight={isLight} />
        <FilePath path={path} isLight={isLight} />
        {step.lineRange && <span className={`shrink-0 font-mono text-[10.5px] ${muted}`}>{step.lineRange}</span>}
        {step.type === 'edited' && (step.count ?? 0) > 1 && (
          <span title={`${step.count} kali diedit (diff gabungan)`} className={`shrink-0 font-mono text-[10.5px] ${muted}`}>
            {step.count}×
          </span>
        )}
      </>
    );
  } else if (step.type === 'command') {
    object = (
      <code
        title={step.command || step.label}
        className={`truncate font-mono text-[11.5px] px-1.5 py-0.5 rounded-md border ${
          isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-black/30 border-white/[0.06] text-slate-200'
        }`}
      >
        {step.command || step.label}
      </code>
    );
  } else if (isPlan) {
    object = todos.length > 0 ? <span className={`truncate ${muted}`}>{doneTodos}/{todos.length} selesai</span> : null;
  } else if (step.type === 'tool') {
    object = (
      <>
        <span className={`shrink-0 font-mono text-[11.5px] ${strong}`}>{step.toolName || step.label}</span>
        {step.detail && <span className={`truncate ${muted}`}>{step.detail}</span>}
      </>
    );
  } else {
    object = <span title={step.label} className={`truncate ${strong}`}>{step.label}</span>;
  }

  return (
    <li className="relative pl-9">
      <StepNode type={step.type} status={step.status} isLight={isLight} />

      <div
        onClick={expandable ? () => setManualOpen(!open) : undefined}
        role={expandable ? 'button' : undefined}
        aria-expanded={expandable ? open : undefined}
        className={`group flex items-center gap-2 min-w-0 min-h-[28px] text-[12.5px] rounded-lg px-1.5 -mx-1.5 transition-colors ${
          expandable ? `cursor-pointer ${isLight ? 'hover:bg-slate-100/80' : 'hover:bg-white/[0.03]'}` : ''
        }`}
      >
        <span className={`shrink-0 font-medium ${failed ? 'text-rose-500' : denied ? (isLight ? 'text-amber-700' : 'text-amber-300') : strong}`}>
          {meta.verb}
        </span>
        <span className="flex items-center gap-1.5 min-w-0 flex-1">{object}</span>
        <span className="flex items-center gap-1.5 shrink-0 text-[10.5px]">
          {step.type === 'edited' && step.additions !== undefined && (
            <DiffStat additions={step.additions ?? 0} deletions={step.deletions ?? 0} bar={false} />
          )}
          {hasDiff && onOpenDiff && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDiff(diff!);
              }}
              className={`px-1.5 py-0.5 rounded-md font-semibold cursor-pointer opacity-70 group-hover:opacity-100 transition-opacity ${
                isLight ? 'text-blue-700 soraja-grad-soft' : 'text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/15'
              }`}
            >
              Tinjau
            </button>
          )}
          {failed && <span className="px-1.5 py-0.5 rounded-md font-semibold text-rose-500 bg-rose-500/10">gagal</span>}
          {denied && (
            <span
              title="Ditolak kebijakan izin mode aman. Buka sesi di Terminal untuk menyetujuinya."
              className={`px-1.5 py-0.5 rounded-md font-semibold ${isLight ? 'text-amber-700 bg-amber-50' : 'text-amber-300 bg-amber-500/10'}`}
            >
              ditolak
            </span>
          )}
          {duration && <span className={`font-mono ${muted}`}>{duration}</span>}
          {expandable && <ChevronRight className={`w-3.5 h-3.5 transition-transform ${muted} ${open ? 'rotate-90' : ''}`} />}
        </span>
      </div>

      {isPlan && todos.length > 0 && (
        <div className="mt-1 mb-1.5">
          <PlanList todos={todos} isLight={isLight} />
        </div>
      )}

      {open && expandable && (
        <div className="mt-1 mb-1.5">
          {isThought ? (
            <div className={`pl-3 border-l-2 ${isLight ? 'border-violet-200' : 'border-violet-500/25'}`}>
              <MarkdownContent content={step.thoughtContent || ''} isLight={isLight} size="compact" />
            </div>
          ) : hasDiff ? (
            <DiffPreview chunk={diff!} isLight={isLight} onOpen={onOpenDiff ? () => onOpenDiff(diff!) : undefined} />
          ) : (
            <OutputBlock
              command={step.type === 'command' ? step.command : undefined}
              output={outputText}
              isLight={isLight}
              failed={failed}
            />
          )}
        </div>
      )}
    </li>
  );
}
