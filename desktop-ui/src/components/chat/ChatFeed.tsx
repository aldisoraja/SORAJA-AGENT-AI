import { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { Folder, FolderPlus, Loader2, Sparkles } from 'lucide-react';
import type { MessageRecord, ProjectRecord, AppSettings, CodeEditChunk } from '../../types/database';
import type { AgentProvider } from '../../types/agent';
import { ImagePreviewModal } from '../ui/ImagePreviewModal';
import { UserMessage } from './UserMessage';
import { AgentMessage } from './AgentMessage';

interface ChatFeedProps {
  messages: MessageRecord[];
  activeProject: ProjectRecord | null;
  selectedAgent: AgentProvider;
  settings: AppSettings | null;
  expandedReasoning?: Record<string, boolean>;
  isLight?: boolean;
  isGenerating?: boolean;
  onToggleReasoning?: (msgId: string) => void;
  onOpenNewProjectWizard: () => void;
  onOpenDiffReview: (files: CodeEditChunk[], activeIndex?: number) => void;
}

/** Jarak (px) dari dasar yang masih dianggap "mengikuti" percakapan untuk auto-scroll. */
const STICK_THRESHOLD = 160;

export function ChatFeed({
  messages,
  activeProject,
  selectedAgent,
  settings,
  isLight = false,
  isGenerating = false,
  onOpenNewProjectWizard,
  onOpenDiffReview,
}: ChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
  };

  // Pesan baru dari pengguna selalu menggulir ke bawah; streaming hanya bila pengguna sedang di bawah.
  const lastMsg = messages[messages.length - 1];
  useEffect(() => {
    if (lastMsg?.sender === 'user') stickToBottom.current = true;
  }, [lastMsg?.id, lastMsg?.sender]);

  useLayoutEffect(() => {
    if (stickToBottom.current) chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // Indikator cadangan bila pesan agen belum dibuat (mis. lampiran sedang disimpan).
  const waitingWithoutBubble = isGenerating && !(lastMsg?.sender === 'agent' && lastMsg.status === 'running');

  return (
    <>
      <ImagePreviewModal
        isOpen={Boolean(preview)}
        onClose={() => setPreview(null)}
        imageUrl={preview?.url || ''}
        title={preview?.title || ''}
        isLight={isLight}
      />

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 sm:px-6 py-5 select-text cursor-text">
        {!activeProject ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-4 py-8 max-w-md mx-auto">
            <Folder className={`w-12 h-12 ${isLight ? 'text-blue-500/50' : 'text-cyan-500/40'}`} />
            <div>
              <p className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>Belum Ada Ruang Kerja Terpilih</p>
              <p className="text-xs max-w-sm mt-1 text-slate-500">
                Buka folder repositori di komputer Anda untuk mulai berinteraksi dengan agen AI Soraja.
              </p>
            </div>
            <button
              onClick={onOpenNewProjectWizard}
              className={`px-4 py-2 font-bold text-xs rounded-xl hover:opacity-90 transition cursor-pointer flex items-center gap-2 shadow-md ${
                isLight
                  ? 'soraja-grad-primary text-white'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow-cyan-950/40'
              }`}
            >
              <FolderPlus className="w-4 h-4" />
              <span>Buka Folder Proyek (Gunakan Folder)</span>
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-3 px-4 py-8 max-w-md mx-auto">
            <Sparkles className={`w-10 h-10 ${isLight ? 'text-blue-500/50' : 'text-cyan-500/40'}`} />
            <p className={`text-sm font-semibold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Mulai percakapan dengan {selectedAgent.name}</p>
            <p className="text-xs max-w-sm text-slate-500">
              Ajukan pertanyaan kode, perbaikan bug, tempel hingga 10 gambar, atau ketik{' '}
              <code className={`px-1.5 py-0.5 rounded font-mono font-semibold ${isLight ? 'bg-slate-200 text-blue-700' : 'bg-slate-800 text-cyan-400'}`}>@</code>{' '}
              untuk menyematkan berkas proyek.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex w-full max-w-5xl mx-auto ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.sender === 'user' ? (
                  <UserMessage msg={msg} isLight={isLight} onPreviewImage={(url, title) => setPreview({ url, title })} />
                ) : msg.sender === 'system' ? (
                  <div className={`max-w-2xl rounded-xl p-3 text-xs font-mono border ${isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-900/80 text-slate-300 border-slate-800'}`}>
                    {msg.content}
                  </div>
                ) : (
                  <AgentMessage
                    msg={msg}
                    isLight={isLight}
                    settings={settings}
                    fallbackAgent={selectedAgent}
                    onOpenDiffReview={onOpenDiffReview}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {waitingWithoutBubble && (
          <div className="max-w-5xl mx-auto mt-6">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${isLight ? 'bg-white border-slate-200 text-slate-600' : 'bg-white/[0.03] border-white/[0.08] text-slate-300'}`}>
              <Loader2 className={`w-3.5 h-3.5 animate-spin ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
              Menyiapkan permintaan untuk {selectedAgent.name}…
            </div>
          </div>
        )}
        <div ref={chatEndRef} className="h-2" />
      </div>
    </>
  );
}
