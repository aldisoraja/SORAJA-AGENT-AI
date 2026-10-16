import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { TrajectoryStep } from '../../../types/database';
import { ExtBadge } from './FileVisuals';
import { StepNode, TimelineStep } from './TimelineStep';
import { baseName, groupSummary } from './workSummary';

interface StepGroupProps {
  steps: TrajectoryStep[];
  isLight: boolean;
  now: number;
  verbose: boolean;
}

/** Rangkaian baca/cari berurutan yang diringkas jadi satu baris "Menelusuri kode" (bisa dibuka). */
export function StepGroup({ steps, isLight, now, verbose }: StepGroupProps) {
  const [open, setOpen] = useState(false);
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const failed = steps.some((s) => s.status === 'error');
  const files = [...new Map(steps.filter((s) => s.type === 'analyzed').map((s) => [baseName(s.label || s.file), s])).keys()];

  return (
    <li className="relative pl-9">
      <StepNode type="explored" status={failed ? 'error' : 'done'} isLight={isLight} />
      <div
        role="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`group flex items-center gap-2 min-w-0 min-h-[28px] text-[12.5px] rounded-lg px-1.5 -mx-1.5 cursor-pointer transition-colors ${
          isLight ? 'hover:bg-slate-100/80' : 'hover:bg-white/[0.03]'
        }`}
      >
        <span className={`shrink-0 font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Menelusuri kode</span>
        <span className={`shrink-0 ${muted}`}>{groupSummary(steps)}</span>
        {!open && (
          <span className="hidden md:flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            {files.slice(0, 2).map((f) => (
              <span key={f} className={`flex items-center gap-1 min-w-0 font-mono text-[10.5px] ${muted}`}>
                <ExtBadge path={f} isLight={isLight} />
                <span className="truncate max-w-[120px]">{f}</span>
              </span>
            ))}
            {files.length > 2 && <span className={`shrink-0 text-[10.5px] ${muted}`}>+{files.length - 2}</span>}
          </span>
        )}
        <span className="flex-1" />
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${muted} ${open ? 'rotate-90' : ''}`} />
      </div>

      {open && (
        <ol className="mt-1 mb-1 space-y-1">
          {steps.map((s, i) => (
            <TimelineStep key={s.toolId ?? `${s.type}-${i}`} step={s} isLight={isLight} now={now} verbose={verbose} />
          ))}
        </ol>
      )}
    </li>
  );
}
