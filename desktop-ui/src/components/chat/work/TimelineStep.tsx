import { useState, type ReactNode } from 'react';
import {
  Brain,
  ChevronRight,
  CircleX,
  FilePen,
  FileText,
  Loader2,
  Search,
  SquareTerminal,
  Wrench,
} from 'lucide-react';
import type { CodeEditChunk, TrajectoryStep } from '../../../types/database';
import { MarkdownContent } from '../../ui/MarkdownContent';
import { baseName, stepDuration } from './workSummary';

interface TimelineStepProps {
  step: TrajectoryStep;
  isLight: boolean;
  now: number;
  /** Buka blok penalaran yang sudah selesai secara default (Pengaturan → Tampilan proses berpikir). */
  verbose: boolean;
  onOpenDiff?: (files: CodeEditChunk[], index?: number) => void;
}

const EXT_TONE: Record<string, string> = {
  tsx: 'text-sky-400', jsx: 'text-sky-400', ts: 'text-blue-400', js: 'text-amber-400', rs: 'text-orange-400',
  json: 'text-emerald-400', toml: 'text-emerald-400', yaml: 'text-emerald-400', yml: 'text-emerald-400',
  md: 'text-rose-400', css: 'text-purple-400', html: 'text-orange-300', py: 'text-yellow-400', sql: 'text-teal-400',
};

function FileChip({ path, isLight }: { path: string; isLight: boolean }) {
  const name = baseName(path);
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return (
    <span
      title={path}
      className={`inline-flex items-center gap-1.5 min-w-0 px-1.5 py-0.5 rounded-md font-mono text-[11.5px] border ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-white/[0.03] border-white/[0.07] text-slate-200'
      }`}
    >
      {ext && <span className={`text-[9.5px] font-bold uppercase ${EXT_TONE[ext] ?? 'text-slate-400'}`}>{ext}</span>}
      <span className="truncate">{name}</span>
    </span>
  );
}

const ICONS = {
  thought: { Icon: Brain, verb: 'Berpikir', tone: 'text-violet-400' },
  analyzed: { Icon: FileText, verb: 'Membaca', tone: 'text-sky-400' },
  explored: { Icon: Search, verb: 'Mencari', tone: 'text-amber-400' },
  command: { Icon: SquareTerminal, verb: 'Menjalankan', tone: 'text-emerald-400' },
  edited: { Icon: FilePen, verb: 'Mengubah', tone: 'text-orange-400' },
  tool: { Icon: Wrench, verb: 'Tool', tone: 'text-slate-400' },
  running: { Icon: Loader2, verb: 'Memproses', tone: 'text-cyan-400' },
} as const;

/** Satu langkah di timeline "Proses kerja": ikon node, kalimat aksi, meta, dan detail yang bisa dibuka. */
export function TimelineStep({ step, isLight, now, verbose, onOpenDiff }: TimelineStepProps) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const running = step.status === 'running';
  const failed = step.status === 'error';
  const meta = ICONS[step.type] ?? ICONS.tool;
  const duration = stepDuration(step, now);

  const detailText =
    step.type === 'thought' ? step.thoughtContent || '' : step.type === 'command' || step.type === 'tool' ? step.output || '' : '';
  const expandable = !!detailText.trim();
  // Penalaran yang sedang berjalan selalu terbuka; setelah selesai mengikuti preferensi pengguna.
  const open = manualOpen ?? (step.type === 'thought' ? running || verbose : false);
  const canDiff = step.type === 'edited' && !!step.diff && !!onOpenDiff;

  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const strong = isLight ? 'text-slate-800' : 'text-slate-200';

  let object: ReactNode = null;
  if (step.type === 'thought') {
    const preview = (step.thoughtContent || '').replace(/[#*_`>]/g, '').trim().split('\n').find(Boolean) || '';
    object = !open && preview ? <span className={`truncate italic ${muted}`}>{preview}</span> : null;
  } else if (step.type === 'analyzed' || step.type === 'edited') {
    object = (
      <>
        <FileChip path={step.diff?.relativePath || step.label || step.file || ''} isLight={isLight} />
        {step.lineRange && <span className={`font-mono text-[10.5px] ${muted}`}>{step.lineRange}</span>}
      </>
    );
  } else if (step.type === 'command') {
    object = (
      <code className={`truncate font-mono text-[11.5px] px-1.5 py-0.5 rounded-md ${isLight ? 'bg-slate-100 text-slate-800' : 'bg-black/30 text-slate-200'}`}>
        {step.command || step.label}
      </code>
    );
  } else if (step.type === 'tool') {
    object = (
      <>
        <span className={`font-mono text-[11.5px] ${strong}`}>{step.toolName || step.label}</span>
        {step.detail && <span className={`truncate ${muted}`}>{step.detail}</span>}
      </>
    );
  } else {
    object = <span className={`truncate ${strong}`}>{step.label}</span>;
  }

  const onRowClick = () => {
    if (canDiff) onOpenDiff!([step.diff!], 0);
    else if (expandable) setManualOpen(!open);
  };

  return (
    <li className="relative pl-8">
      <span
        className={`absolute left-0 top-[3px] w-[22px] h-[22px] rounded-full grid place-items-center border ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#0d121c] border-white/[0.08]'
        } ${running ? (isLight ? 'ring-2 ring-blue-200' : 'ring-2 ring-cyan-500/25') : ''}`}
      >
        {running ? (
          <Loader2 className={`w-3 h-3 animate-spin ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
        ) : failed ? (
          <CircleX className="w-3 h-3 text-rose-500" />
        ) : (
          <meta.Icon className={`w-3 h-3 ${meta.tone}`} />
        )}
      </span>

      <div
        onClick={onRowClick}
        role={canDiff || expandable ? 'button' : undefined}
        className={`group flex items-center gap-2 min-w-0 min-h-[28px] text-[12.5px] rounded-lg px-1.5 -mx-1.5 transition-colors ${
          canDiff || expandable ? `cursor-pointer ${isLight ? 'hover:bg-slate-100' : 'hover:bg-white/[0.03]'}` : ''
        }`}
      >
        <span className={`shrink-0 font-medium ${failed ? 'text-rose-500' : strong}`}>
          {step.type === 'tool' ? 'Memakai' : meta.verb}
        </span>
        <span className="flex items-center gap-1.5 min-w-0 flex-1">{object}</span>
        <span className="flex items-center gap-1.5 shrink-0 text-[10.5px]">
          {step.type === 'edited' && (step.additions !== undefined || step.deletions !== undefined) && (
            <span className="font-mono font-semibold">
              <span className="text-emerald-500">+{step.additions ?? 0}</span>{' '}
              <span className="text-rose-500">−{step.deletions ?? 0}</span>
            </span>
          )}
          {canDiff && (
            <span className={`px-1.5 py-0.5 rounded-md font-semibold opacity-70 group-hover:opacity-100 ${isLight ? 'text-blue-700 soraja-grad-soft' : 'text-cyan-300 bg-cyan-500/10'}`}>
              Tinjau
            </span>
          )}
          {failed && <span className="text-rose-500 font-semibold">gagal</span>}
          {duration && <span className={muted}>{duration}</span>}
          {expandable && (
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${muted} ${open ? 'rotate-90' : ''}`} />
          )}
        </span>
      </div>

      {open && expandable && (
        <div className="mt-1 mb-1.5">
          {step.type === 'thought' ? (
            <div className={`pl-3 border-l-2 ${isLight ? 'border-violet-200' : 'border-violet-500/25'}`}>
              <MarkdownContent content={detailText} isLight={isLight} size="compact" />
            </div>
          ) : (
            <pre
              className={`max-h-64 overflow-auto rounded-lg border px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-black/35 border-white/[0.06] text-slate-300'
              }`}
            >
              {detailText}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
