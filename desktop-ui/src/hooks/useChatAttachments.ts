/**
 * useChatAttachments.ts
 * Lampiran chat: paste & drag-drop gambar (maks MAX_CHAT_IMAGES, dikompres), dokumen PDF/Word/Excel,
 * pratinjau gambar, dan peringatan batas.
 */
import type React from 'react';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { AttachedFile } from '../types/database';
import {
  MAX_CHAT_IMAGES,
  extractImagesFromClipboard,
  extractImagesFromDataTransfer,
  isImageFile,
  processChatImage,
  readFileAsDataUrl,
} from '../utils/imageUtils';

/** Dokumen di atas batas ini tetap dilampirkan sebagai nama saja (tidak dikirim ke agen). */
const MAX_DOC_BYTES = 20 * 1024 * 1024;

export function useChatAttachments(setInputPrompt: Dispatch<SetStateAction<string>>) {
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  // Copy-paste & drag-drop image states
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const [previewModalTitle, setPreviewModalTitle] = useState<string>('');
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);

  // Auto-dismiss warning notice after 5 seconds
  useEffect(() => {
    if (limitNotice) {
      const timer = setTimeout(() => {
        setLimitNotice(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [limitNotice]);

  const handleAddImageFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const currentImageCount = attachments.filter((a) => a.type === 'image').length;
    const availableSlots = MAX_CHAT_IMAGES - currentImageCount;

    if (availableSlots <= 0) {
      setLimitNotice(
        `Batas maksimal ${MAX_CHAT_IMAGES} gambar per pesan telah tercapai. Hapus beberapa gambar untuk menambahkan gambar baru.`
      );
      return;
    }

    let filesToProcess = files;
    if (files.length > availableSlots) {
      filesToProcess = files.slice(0, availableSlots);
      setLimitNotice(
        `Hanya ${availableSlots} dari ${files.length} gambar yang ditambahkan (batas maksimal ${MAX_CHAT_IMAGES} gambar per pesan).`
      );
    } else {
      setLimitNotice(null);
    }

    setIsProcessingImages(true);
    try {
      const newItems: AttachedFile[] = await Promise.all(
        filesToProcess.map(async (file, idx) => {
          const { dataUrl, previewUrl } = await processChatImage(file);
          const ext = file.type.split('/')[1] || 'png';
          const fallbackName = `screenshot-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}-${currentImageCount + idx + 1}.${ext}`;
          return {
            id: `img-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
            name: file.name && file.name !== 'image.png' ? file.name : fallbackName,
            size: `${(file.size / 1024).toFixed(1)} KB`,
            type: 'image' as const,
            previewUrl,
            dataUrl,
          };
        })
      );
      setAttachments((prev) => [...prev, ...newItems]);
    } catch (err) {
      console.error('Error processing images:', err);
    } finally {
      setIsProcessingImages(false);
    }
  };

  const handleNonImageFiles = async (files: File[]) => {
    const tooBig = files.filter((f) => f.size > MAX_DOC_BYTES).map((f) => f.name);
    if (tooBig.length > 0) {
      setLimitNotice(`Dokumen melebihi 20 MB tidak bisa dibaca agen: ${tooBig.join(', ')}`);
    }
    const newFiles: AttachedFile[] = await Promise.all(files.map(async (file, idx) => {
      const nameLower = file.name.toLowerCase();
      const isPdf = file.type === 'application/pdf' || nameLower.endsWith('.pdf');
      const isWord =
        nameLower.endsWith('.doc') ||
        nameLower.endsWith('.docx') ||
        file.type.includes('word') ||
        file.type.includes('officedocument.wordprocessingml');
      const isExcel =
        nameLower.endsWith('.xls') ||
        nameLower.endsWith('.xlsx') ||
        nameLower.endsWith('.csv') ||
        file.type.includes('excel') ||
        file.type.includes('spreadsheet') ||
        file.type.includes('officedocument.spreadsheetml');

      let fileType: 'pdf' | 'word' | 'excel' | 'doc' = 'doc';
      if (isPdf) fileType = 'pdf';
      else if (isWord) fileType = 'word';
      else if (isExcel) fileType = 'excel';

      return {
        id: `file-${Date.now()}-${idx}`,
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        type: fileType,
        dataUrl: file.size <= MAX_DOC_BYTES ? await readFileAsDataUrl(file).catch(() => undefined) : undefined,
      };
    }));
    setAttachments((prev) => [...prev, ...newFiles]);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const images = extractImagesFromClipboard(e);
    if (images.length > 0) {
      e.preventDefault();
      handleAddImageFiles(images);

      const text = e.clipboardData?.getData('text/plain');
      if (text && text.trim()) {
        setInputPrompt((prev) => (prev ? `${prev} ${text}` : text));
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const images = extractImagesFromDataTransfer(e);
    if (images.length > 0) {
      handleAddImageFiles(images);
    }

    const otherFiles = Array.from(e.dataTransfer.files).filter((f) => !isImageFile(f));
    if (otherFiles.length > 0) {
      void handleNonImageFiles(otherFiles);
    }
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const allFiles = Array.from(e.target.files);
      const images = allFiles.filter((f) => isImageFile(f));
      const nonImages = allFiles.filter((f) => !isImageFile(f));

      if (images.length > 0) {
        handleAddImageFiles(images);
      }
      if (nonImages.length > 0) {
        void handleNonImageFiles(nonImages);
      }
      e.target.value = '';
    }
  };

  return {
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
  };
}
