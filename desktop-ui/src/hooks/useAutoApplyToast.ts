/**
 * useAutoApplyToast.ts
 * Perubahan kode agen diterapkan langsung ke berkas kerja (auto-apply, tanpa tombol Terima/Tolak).
 * Hook ini menampilkan toast sukses ketika jawaban agen selesai dengan perubahan kode.
 * Hanya pesan yang pernah terlihat `running` di sesi ini yang dipantau, jadi riwayat lama tidak ikut.
 * Diff dari CLI dilampirkan async (`git diff`) dan bisa tiba setelah pesan selesai, sehingga toast
 * muncul lagi bila jumlah berkas yang diubah bertambah.
 */
import { useEffect, useRef } from 'react';
import type { MessageRecord } from '../types/database';

export function useAutoApplyToast(messages: MessageRecord[], showToast: (msg: string) => void) {
  /** id pesan yang dipantau → jumlah berkas yang sudah diumumkan lewat toast. */
  const announced = useRef(new Map<string, number>());
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    for (const m of messages) {
      if (m.sender !== 'agent') continue;
      if (m.status === 'running') {
        if (!announced.current.has(m.id)) announced.current.set(m.id, 0);
        continue;
      }
      const prev = announced.current.get(m.id);
      const count = m.codeEdits?.length ?? 0;
      if (prev === undefined || m.status !== 'done' || count <= prev) continue;
      announced.current.set(m.id, count);
      showToastRef.current(`${count} berkas berhasil diperbarui — perubahan kode sudah diterapkan ke berkas kerja.`);
    }
  }, [messages]);
}
