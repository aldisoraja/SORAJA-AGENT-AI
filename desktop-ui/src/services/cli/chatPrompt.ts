/**
 * chatPrompt.ts
 * Penyusun prompt khusus mode Chat GUI: aturan penalaran mendalam + format jawaban, dan daftar lampiran
 * (gambar/dokumen) yang sudah disimpan sebagai berkas agar dibaca oleh keempat CLI agen.
 * Spesifikasi: specs/agent-protocols.md §2 ("Penalaran & lampiran Chat GUI"). Modul murni (diuji `node --test`).
 */

/** Kedalaman penalaran Chat GUI. Terminal tetap memakai default CLI pengguna. */
export type ChatEffort = 'high' | 'xhigh' | 'max';

/**
 * Aturan tambahan mode Chat GUI: penalaran lebih dalam dari Terminal & jawaban Markdown yang mudah dibaca.
 * Dikirim sebagai system prompt (claude/codex) atau prefiks prompt (antigravity/opencode).
 */
export const CHAT_REASONING_RULE = [
  'Mode Chat GUI Soraja — jawaban ditampilkan sebagai Markdown di aplikasi desktop.',
  '1. Pahami seluruh pesan pengguna kalimat demi kalimat; pastikan tidak ada satu permintaan pun yang terlewat. Bila ada lampiran, buka dan baca SEMUANYA lebih dulu.',
  '2. Bernalar secara mendalam sebelum bertindak: telusuri kode dan berkas yang relevan, verifikasi setiap asumsi dengan membaca sumber aslinya, dan pertimbangkan edge case. Jangan mengarang nama berkas, fungsi, maupun hasil.',
  '3. Setelah mengubah kode, verifikasi (build/tes/lint) bila memungkinkan dan laporkan hasilnya apa adanya, termasuk bila gagal.',
  '4. Susun jawaban akhir agar mudah dipahami semua pengguna: buka dengan ringkasan 1–2 kalimat, lalu bagian ber-heading (###), poin-poin singkat, tabel untuk perbandingan, blok kode berlabel bahasa, dan path berkas dalam `backtick`. Tutup dengan langkah berikutnya bila relevan.',
].join('\n');

export interface PromptAttachment {
  /** Path absolut berkas lampiran di disk. */
  path: string;
  /** Nama asli dari pengguna (mis. "screenshot-1.png"). */
  name: string;
  kind: 'image' | 'document';
}

/** Dokumen biner yang perlu diekstrak (bukan teks/PDF yang bisa dibaca langsung). */
const NEEDS_EXTRACTION = /\.(docx?|xlsx?|pptx?)$/i;

/**
 * Prompt akhir untuk CLI: teks pengguna apa adanya + blok lampiran bernomor.
 * `imagesAttachedNatively` = gambar juga dikirim lewat flag CLI (codex `--image`, opencode `--file`).
 */
export function buildChatPrompt(
  userText: string,
  attachments: PromptAttachment[] = [],
  imagesAttachedNatively = false
): string {
  const text = userText.trim();
  if (attachments.length === 0) return text;

  const images = attachments.filter((a) => a.kind === 'image');
  const docs = attachments.filter((a) => a.kind === 'document');
  const counts = [images.length && `${images.length} gambar`, docs.length && `${docs.length} dokumen`]
    .filter(Boolean)
    .join(', ');
  const lines = [
    ...images.map((a, i) => `- Gambar #${i + 1} "${a.name}": ${a.path}`),
    ...docs.map((a, i) => `- Dokumen #${i + 1} "${a.name}": ${a.path}`),
  ];
  const notes = [
    'Wajib: buka dan periksa SETIAP lampiran di atas dengan tool baca berkas sebelum menjawab. ' +
      'Gambar dibaca secara visual, termasuk seluruh teks, angka, dan detail UI di dalamnya. ' +
      'Sebut gambar sesuai nomornya (#1, #2, …) dan jangan menebak isi lampiran yang belum dibaca.',
  ];
  if (images.length > 0 && imagesAttachedNatively) {
    notes.push('Gambar juga sudah dilampirkan langsung pada pesan ini dengan urutan yang sama.');
  }
  if (docs.some((d) => NEEDS_EXTRACTION.test(d.name))) {
    notes.push('Untuk dokumen Word/Excel/PowerPoint, ekstrak isinya dengan tool yang tersedia (mis. skrip Python) bila tidak bisa dibaca langsung.');
  }

  return [
    text || '(Pengguna hanya mengirim lampiran — analisis lampiran berikut.)',
    '',
    '---',
    `Lampiran pengguna (${counts}), tersimpan sebagai berkas lokal:`,
    ...lines,
    '',
    ...notes,
  ].join('\n');
}

/** Nama berkas lampiran berurutan & aman (01-nama.png) agar urutan di disk = urutan di chat. */
export function attachmentFileName(index: number, name: string, fallbackExt = 'bin'): string {
  const safe = name.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || `lampiran.${fallbackExt}`;
  const withExt = /\.[a-z0-9]{1,6}$/i.test(safe) ? safe : `${safe}.${fallbackExt}`;
  return `${String(index + 1).padStart(2, '0')}-${withExt}`;
}
