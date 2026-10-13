/**
 * chatAttachmentStore.ts
 * Menyimpan lampiran Chat GUI (gambar & dokumen) ke `<proyek>/.soraja/attachments/<pesan>/` agar keempat
 * CLI agen bisa membacanya. Desktop: IPC `save_chat_attachment`; browser dev: jembatan Vite
 * `/api/save-chat-attachment` (headlessBridge.ts). Spesifikasi: specs/ipc-contracts.md §4.
 */
import { invoke } from '@tauri-apps/api/core';
import type { AttachedFile } from '../types/database';
import { isTauriRuntime } from './headlessTransport';
import { attachmentFileName, type PromptAttachment } from './cli/chatPrompt';
import { imageExtFromDataUrl } from '../utils/imageUtils';

async function saveOne(projectPath: string, messageId: string, fileName: string, dataUrl: string): Promise<string> {
  if (isTauriRuntime) {
    return invoke<string>('save_chat_attachment', { projectPath, messageId, fileName, dataBase64: dataUrl });
  }
  const res = await fetch('/api/save-chat-attachment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, messageId, fileName, dataBase64: dataUrl }),
  });
  const body = (await res.json().catch(() => ({}))) as { filePath?: string; error?: string };
  if (!res.ok || !body.filePath) throw new Error(body.error || `HTTP ${res.status}`);
  return body.filePath;
}

export interface PersistedAttachments {
  /** Lampiran untuk disimpan di riwayat: tanpa `dataUrl`, dengan `savedPath` bila berhasil. */
  records: AttachedFile[];
  /** Lampiran yang benar-benar tersedia sebagai berkas untuk agen (urutan sama dengan chat). */
  forPrompt: PromptAttachment[];
  /** Nama lampiran yang gagal disimpan / tidak punya data. */
  failed: string[];
}

/** Menyimpan semua lampiran secara paralel; kegagalan satu berkas tidak menggagalkan yang lain. */
export async function persistChatAttachments(
  projectPath: string,
  messageId: string,
  attachments: AttachedFile[]
): Promise<PersistedAttachments> {
  const results = await Promise.all(
    attachments.map(async (att, idx) => {
      const data = att.dataUrl || (att.type === 'image' ? att.previewUrl : undefined);
      if (!data || !data.startsWith('data:')) return { att, path: undefined };
      const ext = att.type === 'image' ? imageExtFromDataUrl(data) : 'bin';
      try {
        const path = await saveOne(projectPath, messageId, attachmentFileName(idx, att.name, ext), data);
        return { att, path };
      } catch (err) {
        console.warn(`Gagal menyimpan lampiran ${att.name}:`, err);
        return { att, path: undefined };
      }
    })
  );

  return {
    records: results.map(({ att, path }) => {
      const { dataUrl: _omit, ...rest } = att;
      return path ? { ...rest, savedPath: path } : rest;
    }),
    forPrompt: results
      .filter((r): r is { att: AttachedFile; path: string } => !!r.path)
      .map(({ att, path }) => ({ path, name: att.name, kind: att.type === 'image' ? 'image' : 'document' })),
    failed: results.filter((r) => !r.path).map((r) => r.att.name),
  };
}
