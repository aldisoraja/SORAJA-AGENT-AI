import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { TrajectoryStep } from '../../../types/database';
import { ExtBadge } from './FileVisuals';
import { StepNode, TimelineStep } from './TimelineStep';
import { activityLabel, baseName, groupSummary } from './workSummary';

interface StepGroupProps {
  steps: TrajectoryStep[];
  isLight: boolean;
  now: number;
  verbose: boolean;
}

/**
 * Rangkaian baca/cari berurutan yang diringkas jadi satu baris "Menelusuri kode" (bisa dibuka).
 * Langkah yang masih berjalan tetap di dalam grup; header menampilkan aktivitas live-nya.
 */
export function StepGroup({ steps, isLight, now, verbose }: StepGroupProps) {
  const [open, setOpen] = useState(false);
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const failed = steps.some((s) => s.status === 'error');
  const running = steps.some((s) => s.status === 'running');
  const files = [...new Map(steps.filter((s) => s.type === 'analyzed').map((s) => [baseName(s.label || s.file), s])).keys()];
  const chip = isLight ? 'bg-slate-100 border-slate-200' : 'bg-white/[0.03] border-white/[0.06]';

  return (
    <li className="relative pl-9">
      <StepNode type="explored" status={running ? 'running' : failed ? 'error' : 'done'} isLight={isLight} />
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(!open);
          }
        }}
        className={`group flex items-center gap-2 min-w-0 h-7 text-[12.5px] rounded-lg px-1.5 -mx-1.5 cursor-pointer select-none transition-colors outline-none focus-visible:ring-1 ${
          isLight ? 'hover:bg-slate-100/80 focus-visible:ring-blue-300' : 'hover:bg-white/[0.03] focus-visible:ring-cyan-500/40'
        }`}
      >
        <span className={`shrink-0 font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Menelusuri kode</span>
        <span className={`shrink-0 tabular-nums ${muted}`}>{groupSummary(steps)}</span>
        <span className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          {running ? (
            <span className={`truncate text-[11.5px] ${isLight ? 'text-blue-600' : 'text-cyan-300/90'}`}>{activityLabel(steps, false)}</span>
          ) : (
            !open && (
              <span className="hidden md:flex items-center gap-1.5 min-w-0 overflow-hidden">
                {files.slice(0, 2).map((f) => (
                  <span
                    key={f}
                    title={f}
                    className={`flex items-center gap-1 min-w-0 h-5 pl-0.5 pr-1.5 rounded-md border font-mono text-[10.5px] ${chip} ${muted}`}
                  >
                    <ExtBadge path={f} isLight={isLight} />
                    <span className="truncate max-w-[140px]">{f}</span>
                  </span>
                ))}
                {files.length > 2 && (
                  <span className={`shrink-0 h-5 px-1.5 grid place-items-center rounded-md border text-[10.5px] tabular-nums ${chip} ${muted}`}>
                    +{files.length - 2}
                  </span>
                )}
              </span>
            )
          )}
        </span>
        <ChevronRight
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${muted} ${open ? 'rotate-90' : ''} opacity-60 group-hover:opacity-100`}
        />
      </div>

      {/* Animasi tinggi halus via grid-rows (0fr → 1fr) agar buka/tutup tidak melompat. */}
      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden min-h-0" aria-hidden={!open}>
          <ol className={`mt-1 mb-1 ml-1 pl-3 space-y-1 border-l ${isLight ? 'border-slate-200' : 'border-white/[0.06]'}`}>
            {steps.map((s, i) => (
              <TimelineStep key={s.toolId ?? `${s.type}-${i}`} step={s} isLight={isLight} now={now} verbose={verbose} />
            ))}
          </ol>
        </div>
      </div>
    </li>
  );
}
