import React, { useState } from 'react';
import { Check, ChevronDown, FolderGit2, FolderOpen, FolderPlus } from 'lucide-react';
import type { ProjectRecord } from '../../types/database';

interface WorkspacePickerProps {
  isLight: boolean;
  projects: ProjectRecord[];
  selectedDirectory: string;
  onSelectDirectory: (path: string) => void;
  onPickNewDirectory?: () => Promise<ProjectRecord | null | void> | void;
}

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path;

/** Combobox "Direktori Kerja": menampilkan repo aktif dan daftar repo lain yang bisa dipilih. */
export const WorkspacePicker: React.FC<WorkspacePickerProps> = ({
  isLight,
  projects,
  selectedDirectory,
  onSelectDirectory,
  onPickNewDirectory,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const current = projects.find((p) => p.path === selectedDirectory);
  const currentName = current?.name || baseName(selectedDirectory);
  const canOpen = projects.length > 0 || !!onPickNewDirectory;

  const pickNew = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const picked = await onPickNewDirectory?.();
    if (picked && picked.path) {
      onSelectDirectory(picked.path);
      setIsOpen(false);
    }
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500`}>
          Direktori Kerja
        </span>
        {projects.length > 0 && (
          <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>{projects.length} repo tersimpan</span>
        )}
      </div>

      <div
        className={`rounded-xl border transition-colors ${
          isOpen
            ? isLight
              ? 'border-blue-300 bg-white shadow-[0_0_0_3px_rgba(59,130,246,0.12)]'
              : 'border-cyan-500/50 bg-slate-900/80 shadow-[0_0_0_3px_rgba(34,211,238,0.08)]'
            : isLight
            ? 'border-slate-200 bg-slate-50'
            : 'border-slate-700/70 bg-slate-900/50'
        }`}
      >
        <button
          type="button"
          disabled={!canOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          title={selectedDirectory}
          className={`group w-full flex items-center gap-2.5 p-2 text-left rounded-xl cursor-pointer disabled:cursor-default transition ${
            isLight ? 'hover:bg-slate-100/80' : 'hover:bg-slate-800/50'
          }`}
        >
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
              isLight ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
            }`}
          >
            <FolderGit2 className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-xs font-semibold truncate ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>{currentName}</div>
            <div className={`font-mono text-[10px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{selectedDirectory}</div>
          </div>
          {canOpen && (
            <span
              className={`flex items-center gap-1 shrink-0 pl-2 pr-1.5 py-1 rounded-md text-[10px] font-medium border transition ${
                isLight
                  ? 'text-blue-600 border-blue-200 bg-white group-hover:bg-blue-50'
                  : 'text-cyan-300 border-cyan-500/30 bg-cyan-500/5 group-hover:bg-cyan-500/15'
              }`}
            >
              Ganti
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </span>
          )}
        </button>

        {isOpen && (
          <div className={`border-t p-1.5 animate-in fade-in slide-in-from-top-1 ${isLight ? 'border-slate-200' : 'border-slate-700/60'}`}>
            {projects.length > 0 && (
              <div className="max-h-44 overflow-y-auto space-y-0.5 pr-0.5">
                {projects.map((p) => {
                  const active = p.path === selectedDirectory;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      title={p.path}
                      onClick={() => {
                        onSelectDirectory(p.path);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left cursor-pointer transition ${
                        active
                          ? isLight
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-cyan-500/10 text-cyan-200'
                          : isLight
                          ? 'text-slate-700 hover:bg-slate-100'
                          : 'text-slate-300 hover:bg-slate-800/70'
                      }`}
                    >
                      <FolderOpen
                        className={`w-3.5 h-3.5 shrink-0 ${active ? (isLight ? 'text-blue-500' : 'text-cyan-400') : 'text-slate-500'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`text-[11px] truncate ${active ? 'font-semibold' : 'font-medium'}`}>{p.name}</div>
                        <div className={`font-mono text-[9px] truncate ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>{p.path}</div>
                      </div>
                      {active && <Check className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-blue-500' : 'text-cyan-400'}`} />}
                    </button>
                  );
                })}
              </div>
            )}

            {onPickNewDirectory && (
              <button
                type="button"
                onClick={pickNew}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer border border-dashed transition ${
                  projects.length > 0 ? 'mt-1.5' : ''
                } ${
                  isLight
                    ? 'border-slate-300 text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/60'
                    : 'border-slate-700 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300 hover:bg-cyan-500/5'
                }`}
              >
                <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                Buka folder lain dari komputer…
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
