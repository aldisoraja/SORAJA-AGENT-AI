import React, { useRef, useState } from 'react';
import { X, Plus, ChevronUp, Send, Square, Pause, Play, AlertTriangle, UploadCloud } from 'lucide-react';
import type { AttachedFile, ProjectRecord, ConversationRecord } from '../../types/database';
import type { AgentProvider, ModelItem } from '../../types/agent';
import { ModelSelectorDropdown } from './ModelSelectorDropdown';
import { ChatExecutionStrip } from './ChatExecutionStrip';
import { ImagePreviewModal } from '../ui/ImagePreviewModal';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { ChatAttachmentGallery } from './ChatAttachmentGallery';
import { ChatAddContextFlyout, ChatMentionMenu, ChatSlashMenu } from './ChatContextMenus';
import { MAX_CHAT_IMAGES } from '../../utils/imageUtils';
import { useChatAttachments } from '../../hooks/useChatAttachments';
import type { CliAgentStatus } from '../../services/cliAdapters';

interface ChatInputBarProps {
  isLight: boolean;
  isHighContrast: boolean;
  currentModalSidebar: string;
  activeProject: ProjectRecord | null;
  activeConversation: ConversationRecord | null;
  selectedAgent: AgentProvider;
  selectedModel: ModelItem;
  agentProviders?: AgentProvider[];
  onSelectAgent?: (agent: AgentProvider) => void;
  installedCliAgents?: Record<string, CliAgentStatus>;
  isGenerating?: boolean;
  isPaused?: boolean;
  onSelectModel: (model: ModelItem) => void;
  onSendMessage: (prompt: string, attachments: AttachedFile[]) => Promise<void>;
  onStop?: () => void;
  onTogglePause?: () => void;
  onOpenUsageModal: () => void;
  onUploadMedia?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  workspaceFiles?: string[];
}

export function ChatInputBar({
  isLight,
  isHighContrast,
  currentModalSidebar,
  activeProject,
  activeConversation,
  selectedAgent,
  selectedModel,
  agentProviders,
  onSelectAgent,
  installedCliAgents,
  isGenerating = false,
  isPaused = false,
  workspaceFiles = [],
  onSelectModel,
  onSendMessage,
  onStop,
  onTogglePause,
  onOpenUsageModal,
}: ChatInputBarProps) {
  const [inputPrompt, setInputPrompt] = useState('');
  const [isAddContextOpen, setIsAddContextOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isMentionMenuOpen, setIsMentionMenuOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false);

  const {
    attachments,
    setAttachments,
    previewModalUrl,
    setPreviewModalUrl,
    previewModalTitle,
    setPreviewModalTitle,
    limitNotice,
    setLimitNotice,
    isDragging,
    isProcessingImages,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleMediaUpload,
  } = useChatAttachments(setInputPrompt);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const handleSelectMentionFile = (filename: string) => {
    setInputPrompt((prev) => {
      const parts = prev.split('@');
      parts.pop();
      return `${parts.join('@')}@${filename} `;
    });
    setIsMentionMenuOpen(false);
  };

  const handleSend = () => {
    if (isGenerating) return;
    if (!inputPrompt.trim() && attachments.length === 0) return;
    onSendMessage(inputPrompt, attachments);
    setInputPrompt('');
    setAttachments([]);
    setLimitNotice(null);
    setIsMentionMenuOpen(false);
    setIsSlashMenuOpen(false);
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleMediaUpload}
        accept="image/png,image/jpeg,image/webp,image/jpg,image/gif,image/bmp,application/pdf,.doc,.docx,.xls,.xlsx,.csv,text/*"
        multiple
        className="hidden"
      />

      {/* Lightbox Modal for Full Image Inspection */}
      <ImagePreviewModal
        isOpen={Boolean(previewModalUrl)}
        onClose={() => setPreviewModalUrl(null)}
        imageUrl={previewModalUrl || ''}
        title={previewModalTitle}
        isLight={isLight}
      />

      <ChatExecutionStrip
        isLight={isLight}
        activeProject={activeProject}
        activeConversation={activeConversation}
        selectedAgent={selectedAgent}
        selectedModel={selectedModel}
        isGenerating={isGenerating}
        isPaused={isPaused}
      />

      {/* Chat Input & Toolbar Container */}
      <div
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`p-2.5 sm:p-4 border-t relative transition-colors duration-150 ${
          isLight
            ? `bg-white/80 backdrop-blur-xl ${isHighContrast ? 'border-t-2 border-slate-300' : 'border-slate-200/80'}`
            : `${isHighContrast ? 'border-t-2 border-slate-600' : 'border-slate-800/60'}`
        }`}
        style={!isLight ? { backgroundColor: `${currentModalSidebar}ee` } : {}}
      >
        {/* Drag & Drop Visual Overlay */}
        {isDragging && (
          <div
            className={`absolute inset-2 z-30 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 backdrop-blur-md animate-in fade-in ${
              isLight
                ? 'border-blue-500 bg-blue-50/90 text-blue-900 shadow-xl'
                : 'border-cyan-400 bg-slate-950/90 text-cyan-300 shadow-xl'
            }`}
          >
            <UploadCloud className="w-8 h-8 animate-bounce text-blue-600" />
            <p className="font-bold text-sm">Lepaskan gambar di sini untuk melampirkan</p>
            <p className="text-xs opacity-75">Maksimal {MAX_CHAT_IMAGES} gambar per pesan (Format PNG, JPG, WebP)</p>
          </div>
        )}

        {/* Limit Warning Notice */}
        {limitNotice && (
          <div
            className={`mb-2.5 px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 border animate-in fade-in slide-in-from-top-1 ${
              isLight
                ? 'bg-amber-50 border-amber-200 text-amber-900 shadow-sm'
                : 'bg-amber-950/60 border-amber-800/60 text-amber-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{limitNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setLimitNotice(null)}
              className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Model tanpa dukungan gambar + ada gambar terlampir */}
        {selectedModel.supportsImages === false && attachments.some((a) => a.type === 'image') && (
          <div
            className={`mb-2.5 px-3 py-2 rounded-xl text-xs flex items-center gap-2 border ${
              isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-950/60 border-amber-800/60 text-amber-300'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              Model <strong>{selectedModel.name}</strong> tidak bisa membaca gambar. Pilih model lain (tanpa ikon mata dicoret) agar
              gambar ikut dianalisis.
            </span>
          </div>
        )}

        {/* Attachment Gallery (Images & Docs) */}
        <ChatAttachmentGallery
          attachments={attachments}
          maxImages={MAX_CHAT_IMAGES}
          isProcessingImages={isProcessingImages}
          isLight={isLight}
          onOpenPreview={(url, title) => {
            setPreviewModalUrl(url);
            setPreviewModalTitle(title);
          }}
          onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
          onRemoveAllImages={() => setAttachments((prev) => prev.filter((a) => a.type !== 'image'))}
          onAddMoreClick={() => fileInputRef.current?.click()}
        />

        {/* Flyout Menus */}
        <ChatAddContextFlyout
          isOpen={isAddContextOpen}
          isLight={isLight}
          imageCount={attachments.filter((a) => a.type === 'image').length}
          maxImages={MAX_CHAT_IMAGES}
          onClose={() => setIsAddContextOpen(false)}
          onOpenMediaUpload={() => fileInputRef.current?.click()}
          onOpenMentions={() => {
            setIsMentionMenuOpen(true);
            setMentionFilter('');
          }}
          onOpenSlashMenu={() => setIsSlashMenuOpen(true)}
          onInsertBrowserCommand={() => setInputPrompt((prev) => prev + '/browser ')}
        />

        <ErrorBoundary name="Pemilih Model">
          <ModelSelectorDropdown
            isOpen={isModelDropdownOpen}
            selectedAgent={selectedAgent}
            selectedModel={selectedModel}
            agentProviders={agentProviders}
            onSelectAgent={onSelectAgent}
            installedCliAgents={installedCliAgents}
            isLight={isLight}
            onSelectModel={onSelectModel}
            onClose={() => setIsModelDropdownOpen(false)}
            onOpenUsageModal={onOpenUsageModal}
          />
        </ErrorBoundary>

        <ChatMentionMenu
          isOpen={isMentionMenuOpen}
          isLight={isLight}
          filter={mentionFilter}
          workspaceFiles={workspaceFiles}
          onSelectFile={handleSelectMentionFile}
        />

        <ChatSlashMenu
          isOpen={isSlashMenuOpen}
          isLight={isLight}
          onSelectCommand={(cmd) => {
            setInputPrompt(cmd + ' ');
            setIsSlashMenuOpen(false);
          }}
        />

        {/* Unified Chat Input Box */}
        <div
          className={`border rounded-2xl p-2.5 transition shadow-xs space-y-2 ${
            isLight
              ? `bg-white ${isHighContrast ? 'border-2 border-slate-300' : 'border-slate-200/90'} focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100`
              : `bg-slate-900/90 ${isHighContrast ? 'border-2 border-slate-600' : 'border-slate-800'} focus-within:border-cyan-500/80`
          }`}
        >
          <input
            ref={textInputRef}
            type="text"
            value={inputPrompt}
            disabled={isGenerating}
            onChange={(e) => {
              const val = e.target.value;
              setInputPrompt(val);

              if (val.endsWith('@')) {
                setIsMentionMenuOpen(true);
                setMentionFilter('');
              } else if (val.includes('@')) {
                const query = val.split('@').pop() || '';
                setMentionFilter(query);
              } else {
                setIsMentionMenuOpen(false);
              }

              if (val.startsWith('/')) {
                setIsSlashMenuOpen(true);
              } else {
                setIsSlashMenuOpen(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              isGenerating
                ? isPaused
                  ? 'Sesi dijeda... Klik tombol Lanjutkan (▶) untuk meneruskan atau Stop (⏹) untuk membatalkan.'
                  : `${selectedAgent.name} sedang bekerja otonom (Klik Stop atau Jeda di samping kanan)...`
                : `Tanya ${selectedAgent.name}, paste gambar (Ctrl+V), atau ketik '@' untuk referensi...`
            }
            className={`w-full bg-transparent text-xs focus:outline-none px-2 py-1 disabled:opacity-60 ${
              isLight ? 'text-slate-900 placeholder:text-slate-400' : 'text-slate-200 placeholder:text-slate-500'
            }`}
          />

          {/* Bottom Row Controls */}
          <div
            className={`flex items-center justify-between pt-1 border-t ${
              isLight ? 'border-slate-100' : 'border-slate-800/40'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {/* Context Plus Button */}
              <button
                onClick={() => {
                  setIsAddContextOpen((prev) => !prev);
                  setIsModelDropdownOpen(false);
                }}
                disabled={isGenerating}
                title="Tambah Konteks (Media, Mentions, Actions, Browser)"
                className={`p-1.5 rounded-xl border transition cursor-pointer disabled:opacity-40 ${
                  isAddContextOpen
                    ? isLight
                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : isLight
                    ? 'text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-slate-200/80 border-slate-200'
                    : 'text-slate-400 hover:text-cyan-400 bg-slate-800/50 hover:bg-slate-800 border-slate-700/60'
                }`}
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Model & Budget Dropdown Trigger (Responsif) */}
              <button
                onClick={() => {
                  setIsModelDropdownOpen((prev) => !prev);
                  setIsAddContextOpen(false);
                }}
                disabled={isGenerating}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border transition cursor-pointer text-xs font-medium select-none shadow-2xs disabled:opacity-50 min-w-0 max-w-[170px] xs:max-w-[220px] sm:max-w-xs md:max-w-sm ${
                  isModelDropdownOpen
                    ? isLight
                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                      : 'bg-slate-800 text-cyan-300 border-cyan-500/40'
                    : isLight
                    ? 'bg-gradient-to-r from-slate-100 via-slate-50 to-white hover:bg-slate-100 border-slate-200 text-slate-800'
                    : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-200'
                }`}
              >
                <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                  {selectedAgent.icon}
                </div>
                <span className={`font-semibold truncate max-w-[90px] xs:max-w-[130px] sm:max-w-[180px] ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                  {selectedModel.name}
                </span>
                {installedCliAgents?.[selectedAgent.id]?.is_installed && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ring-1 ring-emerald-950 shrink-0" title="CLI Native Terhubung" />
                )}
                <ChevronUp className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
              </button>
            </div>

            {/* Right Action Area: Send OR Dual Controls (Pause & Stop) */}
            <div className="flex items-center gap-1.5">
              {isGenerating ? (
                <>
                  {/* Dual Control 1: Tombol Jeda / Lanjutkan (Pause ⏸️ / Resume ▶️) */}
                  <button
                    onClick={onTogglePause}
                    type="button"
                    title={isPaused ? 'Lanjutkan Proses Otonom (Resume)' : 'Jeda Sementara (Pause)'}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border shadow-sm ${
                      isPaused
                        ? isLight
                          ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200 animate-pulse'
                          : 'bg-amber-950/80 border-amber-600/60 text-amber-300 hover:bg-amber-900/90 animate-pulse'
                        : isLight
                        ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                    }`}
                  >
                    {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
                  </button>

                  {/* Dual Control 2: Tombol Stop Total (⏹️) Antigravity Style */}
                  <button
                    onClick={onStop}
                    type="button"
                    title="Hentikan Total Proses Agen (Stop Execution)"
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border group shadow-md ${
                      isLight
                        ? 'bg-slate-900 hover:bg-red-600 border-slate-700 text-white shadow-slate-400/30'
                        : 'bg-[#161a23] hover:bg-red-600/90 border-slate-700/80 hover:border-red-500 text-white shadow-black/50'
                    }`}
                  >
                    <Square className="w-3.5 h-3.5 fill-current transition-transform group-hover:scale-110" />
                  </button>
                </>
              ) : (
                /* Normal Send Button */
                <button
                  onClick={handleSend}
                  disabled={!inputPrompt.trim() && attachments.length === 0}
                  title="Kirim Instruksi (Enter)"
                  className={`w-8 h-8 rounded-full disabled:opacity-30 text-white flex items-center justify-center transition cursor-pointer shadow-md ${
                    isLight
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/25'
                      : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
