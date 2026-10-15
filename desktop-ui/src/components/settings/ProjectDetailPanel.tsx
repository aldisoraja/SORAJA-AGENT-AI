import { useState } from 'react';
import { Check, Copy, MessageSquare, Pin } from 'lucide-react';
import type { ProjectRecord } from '../../types/database';

interface ProjectDetailPanelProps {
  project: ProjectRecord;
  isLight: boolean;
  onSelectProject?: (project: ProjectRecord) => void;
  onTogglePinProject?: (projectId: string) => void;
}

/** Detail proyek di modal Pengaturan (path, pin, mulai percakapan). */
export function ProjectDetailPanel({ project, isLight, onSelectProject, onTogglePinProject }: ProjectDetailPanelProps) {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleCopyPath = (path: string) => {
    try {
      navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch {}
  };

  return (
    <div className="space-y-5">
      <div className={`p-5 rounded-2xl border ${
        isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-900/80 border-slate-800'
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-md"
              style={{ backgroundColor: project.color || '#06b6d4' }}
            >
              {project.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {project.name}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  branch: {project.branch || 'main'}
                </span>
                {project.isPinned && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                    <Pin className="w-3 h-3 fill-amber-400" /> Disematkan
                  </span>
                )}
              </div>
            </div>
          </div>

          {onTogglePinProject && (
            <button
              onClick={() => onTogglePinProject(project.id)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                project.isPinned
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                  : isLight
                  ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Pin className={`w-3.5 h-3.5 ${project.isPinned ? 'fill-amber-400' : ''}`} />
              <span>{project.isPinned ? 'Lepas Sematan' : 'Sematkan Proyek'}</span>
            </button>
          )}
        </div>

        <div className="mt-5 space-y-2">
          <p className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Lokasi Folder Workspace
          </p>
          <div className={`p-3 rounded-xl border font-mono text-xs flex items-center justify-between gap-3 ${
            isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-cyan-300'
          }`}>
            <span className="truncate select-all">{project.path}</span>
            <button
              onClick={() => handleCopyPath(project.path)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                copiedPath === project.path
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              {copiedPath === project.path ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Jalur</span>
                </>
              )}
            </button>
          </div>
        </div>

        {onSelectProject && (
          <div className="mt-5 pt-4 border-t border-slate-800/80 flex justify-end">
            <button
              onClick={() => onSelectProject(project)}
              className={`px-5 py-2.5 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-2 ${isLight ? 'soraja-grad-primary' : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-md'}`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Mulai Percakapan di Proyek Ini</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
