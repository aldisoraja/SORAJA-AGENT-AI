/**
 * agentContextualAnswers.ts
 * Jawaban cadangan (offline) yang MENJAWAB substansi pertanyaan pengguna, dipakai saat CLI agen tidak
 * tersedia / gagal. Tidak ada template tetap: isi disusun dari topik pertanyaan + konteks workspace nyata.
 * Fakta tentang flag CLI bersumber dari `cli/agentCommands.ts` (specs/agent-protocols.md §2).
 */
import type { AgentProvider, ModelItem } from '../types/agent';

export interface AnswerContext {
  agent: AgentProvider;
  model: ModelItem;
  projectName: string;
  files: string[];
}

export interface TopicAnswer {
  topic: string;
  content: string;
}

const has = (lower: string, ...words: string[]) => words.some((w) => lower.includes(w));

/** Penalaran Low / Medium / High: penjelasan umum (Chat GUI tidak mengatur level ini). */
function answerReasoningEffort(ctx: AnswerContext): string {
  return `### 🧠 Tingkat Penalaran: Low, Medium, High

Tingkat penalaran (*reasoning effort / thinking budget*) mengatur **berapa banyak token yang boleh dipakai model untuk "berpikir" sebelum menjawab**.

| Level | Cocok untuk | Kecepatan & biaya |
|---|---|---|
| **Low** | Pertanyaan singkat, rename, perubahan kecil satu berkas | Tercepat, token paling hemat |
| **Medium** | Fitur sedang, bug yang jelas lokasinya, refaktor satu modul | Seimbang (pilihan default yang aman) |
| **High** | Bug rumit lintas modul, desain arsitektur, migrasi besar | Paling lambat dan paling mahal, hasil paling teliti |

Chat GUI Soraja **tidak** mengatur level ini: model yang dipilih (\`${ctx.model.name}\`) dijalankan dengan pengaturan bawaan CLI **${ctx.agent.name}**. Untuk mengubahnya, buka tab **Mesin CLI Terminal** dan pakai perintah bawaan CLI (mis. \`/model\` atau \`/effort\`; di Antigravity level ikut dalam pilihan model).

**Saran praktis:** mulai dari *Medium*; naikkan ke *High* hanya jika jawaban pertama dangkal atau salah arah, dan turunkan ke *Low* untuk tugas mekanis.`;
}

function answerCliUsage(ctx: AnswerContext): string {
  return `### 🖥️ Chat GUI vs Terminal CLI

- **Chat GUI** menjalankan CLI secara *headless* (\`claude -p "<prompt>" --output-format stream-json\`, \`codex exec --json\`, \`opencode run --format json\`, \`agy -p ...\`) lalu menampilkan hasilnya sebagai pesan, jejak penalaran, dan diff.
- **Mesin CLI Terminal** membuka TUI asli dalam PTY — cocok untuk slash command seperti \`/usage\`, \`/model\`, atau login.
- Percakapan Chat GUI dapat dilanjutkan di terminal lewat tombol **Buka di Terminal** (memakai \`--resume\` / \`resume\` sesuai agen).

Agen aktif: **${ctx.agent.name}**. Jika CLI belum login, buka tab Terminal CLI dan selesaikan login sekali; setelah itu Chat GUI memakai kredensial yang sama.`;
}

function answerDebugging(prompt: string, ctx: AnswerContext): string {
  const related = relatedFiles(prompt, ctx.files);
  return `### 🐞 Langkah Menelusuri Masalah

Untuk pertanyaan *"${prompt}"*, urutan yang paling efisien:

1. **Reproduksi & catat pesan error persis** (salin teks lengkap, bukan parafrase).
2. **Tentukan lapisannya:** UI React (\`tsc -b\`, konsol browser), jembatan dev Vite, atau inti Rust (\`cargo check\`).
3. **Persempit** ke satu berkas/fungsi dengan membaca stack trace dari baris paling atas milik proyek Anda.
4. **Perbaiki satu hal, lalu verifikasi ulang** dengan perintah kompilasi yang sama.
${related}
Tempel pesan error atau nama berkasnya di sini, dan saya bisa membantu menganalisis penyebab spesifiknya.`;
}

function answerGit(): string {
  return `### 🔀 Git di Workspace

- \`git status\` → lihat berkas yang berubah; \`git diff\` → lihat isi perubahan.
- Buat cabang sebelum perubahan besar: \`git switch -c fitur/nama-fitur\`.
- Commit kecil dan bermakna: \`git add -p\` lalu \`git commit -m "..."\`.
- Batalkan perubahan satu berkas dengan aman: \`git restore <berkas>\` (perubahan yang belum di-commit akan hilang).

Perintah yang merusak riwayat (\`reset --hard\`, \`push --force\`) sebaiknya selalu melalui konfirmasi manual.`;
}

function answerArchitecture(ctx: AnswerContext): string {
  return `### 🏗️ Arsitektur Soraja AI

- **Inti Rust** (\`crates/\`) — PTY (ConPTY), proses CLI headless, kredensial (DPAPI Keyring), SQLite WAL.
- **Tauri v2** — jembatan IPC antara Rust dan UI; kontrak nama fungsi ada di \`specs/ipc-contracts.md\`.
- **desktop-ui** — React + Tailwind; dua mode kerja: Chat GUI dan Terminal CLI (xterm.js).
- **Dev di browser** — Vite menyediakan jembatan WebSocket untuk PTY dan CLI headless, sehingga CLI asli tetap berjalan tanpa Tauri.

Proyek aktif: **${ctx.projectName}** (${ctx.files.length} berkas terindeks).`;
}

/** Berkas workspace yang namanya cocok dengan kata kunci pertanyaan (maks 5). */
function relatedFiles(prompt: string, files: string[]): string {
  const tokens = Array.from(new Set(prompt.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? []));
  const hits = files
    .map((f) => ({ f, score: tokens.filter((t) => f.toLowerCase().includes(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => `- \`${x.f}\``);
  return hits.length ? `\n**Berkas yang kemungkinan terkait di workspace Anda:**\n${hits.join('\n')}\n` : '';
}

/** Mengembalikan jawaban bila pertanyaan cocok dengan topik yang dikenali; null bila tidak. */
export function answerByTopic(prompt: string, ctx: AnswerContext): TopicAnswer | null {
  const lower = prompt.toLowerCase();
  if (has(lower, 'reasoning', 'penalaran', 'thinking', 'effort', 'berpikir') || /\b(low|medium|high)\b/.test(lower)) {
    return { topic: 'penalaran Low/Medium/High', content: answerReasoningEffort(ctx) };
  }
  if (has(lower, 'headless', 'terminal cli', 'mesin cli', 'chat gui', 'resume') || /\bcli\b/.test(lower)) {
    return { topic: 'penggunaan CLI', content: answerCliUsage(ctx) };
  }
  if (has(lower, 'error', 'gagal', 'bug', 'crash', 'tidak bisa', 'kenapa')) {
    return { topic: 'pemecahan masalah', content: answerDebugging(prompt, ctx) };
  }
  if (/\bgit\b/.test(lower) || has(lower, 'commit', 'branch', 'merge')) {
    return { topic: 'git', content: answerGit() };
  }
  if (has(lower, 'tauri', 'arsitektur', 'ipc', 'rust')) {
    return { topic: 'arsitektur', content: answerArchitecture(ctx) };
  }
  return null;
}

/** Jawaban umum: jujur soal keterbatasan mode cadangan, tetap memberi arah konkret dari konteks workspace. */
export function answerGeneralQuestion(prompt: string, ctx: AnswerContext): string {
  const topic = answerByTopic(prompt, ctx);
  if (topic) return topic.content;
  const related = relatedFiles(prompt, ctx.files);
  const isQuestion = /\?|^(apa|bagaimana|kenapa|mengapa|siapa|kapan|dimana|di mana|apakah|bisakah|jelaskan)\b/i.test(prompt.trim());
  return `Pertanyaan Anda: *"${prompt}"*

Jawaban penuh membutuhkan model/CLI **${ctx.agent.name}** yang sedang tidak terjangkau, jadi saya tidak akan menebak-nebak jawabannya.${
    related
  }
**Yang bisa dilakukan sekarang:**
${
  isQuestion
    ? '- Ulangi pertanyaan setelah CLI aktif (cek tab *Mesin CLI Terminal* apakah agen sudah login).\n- Atau persempit pertanyaan dengan menyebut berkas/fungsi tertentu agar saya bisa merujuk isi workspace langsung.'
    : '- Sebutkan berkas target dan hasil yang diinginkan (mis. *"tambahkan tombol X di `src/...`"*), agar perubahan bisa dirancang dengan tepat.\n- Perubahan kode nyata baru dapat dieksekusi setelah CLI agen aktif.'
}
- Topik yang bisa saya jawab langsung tanpa CLI: penalaran Low/Medium/High, Chat GUI vs Terminal CLI, struktur proyek, pemecahan error, dan git.`;
}
