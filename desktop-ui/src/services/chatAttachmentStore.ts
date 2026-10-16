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
import { OFFICE_EXTRACTABLE, extractOfficeText } from './cli/officeText';
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

function dataUrlBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function textDataUrl(text: string): string {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return `data:text/plain;charset=utf-8;base64,${btoa(bin)}`;
}

/**
 * Dokumen Office (docx/xlsx/pptx): teksnya diekstrak ke `<nama>.txt` di samping berkas asli agar agen bisa
 * membacanya tanpa menjalankan skrip (yang ditolak di mode aman). Gagal ekstraksi → tanpa berkas pendamping.
 */
async function saveExtractedText(projectPath: string, messageId: string, fileName: string, att: AttachedFile, data: string) {
  if (att.type === 'image' || !OFFICE_EXTRACTABLE.test(att.name)) return undefined;
  const text = await extractOfficeText(dataUrlBytes(data), att.name);
  return text ? saveOne(projectPath, messageId, `${fileName}.txt`, textDataUrl(text)) : undefined;
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
      const fileName = attachmentFileName(idx, att.name, ext);
      try {
        const path = await saveOne(projectPath, messageId, fileName, data);
        const textPath = await saveExtractedText(projectPath, messageId, fileName, att, data).catch((err) => {
          console.warn(`Gagal mengekstrak teks ${att.name}:`, err);
          return undefined;
        });
        return { att, path, textPath };
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
      .filter((r): r is { att: AttachedFile; path: string; textPath?: string } => !!r.path)
      .map(({ att, path, textPath }) => ({
        path,
        name: att.name,
        kind: att.type === 'image' ? 'image' : 'document',
        ...(textPath ? { textPath } : {}),
      })),
    failed: results.filter((r) => !r.path).map((r) => r.att.name),
  };
}
