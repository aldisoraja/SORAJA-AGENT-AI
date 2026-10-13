import {
  Image as ImageIcon,
  AtSign,
  Zap,
  Globe,
} from 'lucide-react';
import { SLASH_COMMANDS, PROJECT_WORKSPACE_FILES } from '../../constants/agentProviders';

interface ChatAddContextFlyoutProps {
  isOpen: boolean;
  isLight: boolean;
  imageCount: number;
  maxImages: number;
  onClose: () => void;
  onOpenMediaUpload: () => void;
  onOpenMentions: () => void;
  onOpenSlashMenu: () => void;
  onInsertBrowserCommand: () => void;
}

export function ChatAddContextFlyout({
  isOpen,
  isLight,
  imageCount,
  maxImages,
  onClose,
  onOpenMediaUpload,
  onOpenMentions,
  onOpenSlashMenu,
  onInsertBrowserCommand,
}: ChatAddContextFlyoutProps) {
  if (!isOpen) return null;

  return (
    <div
      className={`absolute bottom-20 left-4 w-64 backdrop-blur-xl border rounded-2xl shadow-2xl p-1.5 z-40 animate-in fade-in zoom-in-95 duration-100 ${
        isLight
          ? 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-300/50'
          : 'bg-[#0c101a]/95 border-slate-800 text-slate-200'
      }`}
    >
      <div
        className={`px-3 py-1.5 text-[11px] font-semibold select-none border-b mb-1 flex items-center justify-between ${
          isLight ? 'text-slate-500 border-slate-200' : 'text-slate-400 border-slate-800/80'
        }`}
      >
        <span>Tambah Konteks</span>
        <span className="text-[10px] font-mono font-normal">
          {imageCount}/{maxImages} gbr
        </span>
      </div>

      <button
        onClick={() => {
          onClose();
          onOpenMediaUpload();
        }}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition cursor-pointer text-left ${
          isLight
            ? 'text-slate-700 hover:text-blue-700 hover:bg-slate-100'
            : 'text-slate-200 hover:text-cyan-300 hover:bg-slate-800/80'
        }`}
      >
        <ImageIcon className={`w-4 h-4 shrink-0 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
        <div className="truncate">
          <span className="font-semibold block">Gambar & Media</span>
          <span className={`text-[10px] block ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            PNG, JPG, WebP (Maks. {maxImages}), PDF, XLS
          </span>
        </div>
      </button>

      <button
        onClick={() => {
          onClose();
          onOpenMentions();
        }}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition cursor-pointer text-left ${
          isLight
            ? 'text-slate-700 hover:text-purple-700 hover:bg-slate-100'
            : 'text-slate-200 hover:text-cyan-300 hover:bg-slate-800/80'
        }`}
      >
        <AtSign className={`w-4 h-4 shrink-0 ${isLight ? 'text-purple-600' : 'text-purple-400'}`} />
        <span>Mentions (Sematkan Berkas)</span>
      </button>

      <button
        onClick={() => {
          onClose();
          onOpenSlashMenu();
        }}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition cursor-pointer text-left ${
          isLight
            ? 'text-slate-700 hover:text-amber-700 hover:bg-slate-100'
            : 'text-slate-200 hover:text-cyan-300 hover:bg-slate-800/80'
        }`}
      >
        <Zap className={`w-4 h-4 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
        <span>Actions (Perintah / Slash)</span>
      </button>

      <button
        onClick={() => {
          onClose();
          onInsertBrowserCommand();
        }}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition cursor-pointer text-left ${
          isLight
            ? 'text-slate-700 hover:text-emerald-700 hover:bg-slate-100'
            : 'text-slate-200 hover:text-cyan-300 hover:bg-slate-800/80'
        }`}
      >
        <Globe className={`w-4 h-4 shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
        <span>Browser (Riset Web & Docs)</span>
      </button>
    </div>
  );
}

interface ChatMentionMenuProps {
  isOpen: boolean;
  isLight: boolean;
  filter: string;
  workspaceFiles?: string[];
  onSelectFile: (fileName: string) => void;
}

export function ChatMentionMenu({ isOpen, isLight, filter, workspaceFiles = [], onSelectFile }: ChatMentionMenuProps) {
  if (!isOpen) return null;

  const pool = workspaceFiles && workspaceFiles.length > 0 ? workspaceFiles : PROJECT_WORKSPACE_FILES;
  const filtered = pool.filter((f) =>
    f.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div
      className={`absolute bottom-20 left-4 w-72 rounded-xl shadow-2xl p-2 z-30 max-h-56 overflow-y-auto border ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-300'
      }`}
    >
      <div
        className={`text-[10px] font-bold px-2 py-1 uppercase tracking-wider ${
          isLight ? 'text-slate-500' : 'text-slate-400'
        }`}
      >
        Sematkan Berkas Proyek (@)
      </div>
      {filtered.map((file) => (
        <div
          key={file}
          onClick={() => onSelectFile(file)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-mono cursor-pointer flex items-center justify-between transition ${
            isLight
              ? 'hover:bg-blue-50 hover:text-blue-700 text-slate-700'
              : 'hover:bg-cyan-950/60 hover:text-cyan-300 text-slate-300'
          }`}
        >
          <span className="truncate">{file}</span>
          <span className={`text-[9px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>Ref</span>
        </div>
      ))}
    </div>
  );
}

interface ChatSlashMenuProps {
  isOpen: boolean;
  isLight: boolean;
  onSelectCommand: (cmd: string) => void;
}

export function ChatSlashMenu({ isOpen, isLight, onSelectCommand }: ChatSlashMenuProps) {
  if (!isOpen) return null;

  return (
    <div
      className={`absolute bottom-20 left-4 w-80 rounded-xl shadow-2xl p-2 z-30 border ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-300'
      }`}
    >
      <div
        className={`text-[10px] font-bold px-2 py-1 uppercase tracking-wider ${
          isLight ? 'text-slate-500' : 'text-slate-400'
        }`}
      >
        Perintah Cepat Agen (Slash Commands)
      </div>
      {SLASH_COMMANDS.map((sc) => (
        <div
          key={sc.cmd}
          onClick={() => onSelectCommand(sc.cmd)}
          className={`px-2.5 py-2 rounded-lg cursor-pointer text-xs space-y-0.5 transition ${
            isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
          }`}
        >
          <p className={`font-bold font-mono ${isLight ? 'text-blue-600' : 'text-cyan-400'}`}>
            {sc.cmd} - {sc.label}
          </p>
          <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{sc.desc}</p>
        </div>
      ))}
    </div>
  );
}
