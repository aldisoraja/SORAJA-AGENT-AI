/**
 * fileChangeDiff.ts
 * Membuat CodeEditChunk untuk DiffReviewPanel dari event `file_change` CLI agen.
 * CLI tidak selalu mengirim isi diff, jadi diff diambil dari `git diff`; jika berkas belum
 * dilacak git (berkas baru) atau folder bukan repo git, seluruh isi berkas dianggap tambahan.
 * Spesifikasi: specs/agent-protocols.md §3 "Diff untuk DiffReviewPanel".
 */
import type { CodeEditChunk } from '../../types/database';

type DiffLine = CodeEditChunk['diffLines'][number];

export function relativeToProject(filePath: string, projectPath: string): string {
  const norm = (p: string) => p.replace(/\\/g, '/');
  const file = norm(filePath);
  const root = norm(projectPath).replace(/\/+$/, '');
  return file.toLowerCase().startsWith(root.toLowerCase() + '/') ? file.slice(root.length + 1) : file;
}

/** Path relatif dari CLI (mis. `src/a.ts`) diselesaikan terhadap folder proyek, bukan folder kerja aplikasi. */
export function absoluteInProject(filePath: string, projectPath: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(filePath) || /^[\\/]/.test(filePath)) return filePath;
  const sep = projectPath.includes('\\') ? '\\' : '/';
  return `${projectPath.replace(/[\\/]+$/, '')}${sep}${filePath.replace(/^\.[\\/]/, '').replace(/[\\/]/g, sep)}`;
}

/** Mengurai output `git diff` (unified diff) satu berkas menjadi CodeEditChunk. */
export function parseUnifiedDiff(diff: string, filePath: string, relativePath: string): CodeEditChunk | null {
  const diffLines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  let oldNo = 0;
  let newNo = 0;
  let lastNewEnd = 0;
  let inHunk = false;

  for (const raw of diff.replace(/\r/g, '').split('\n')) {
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      const hidden = newNo - 1 - lastNewEnd;
      if (hidden > 0) diffLines.push({ type: 'collapsed', text: '', collapsedCount: hidden });
      inHunk = true;
      continue;
    }
    if (!inHunk || raw.startsWith('\\')) continue;
    if (raw.startsWith('+')) {
      additions++;
      diffLines.push({ type: 'added', newLineNo: newNo++, text: raw.slice(1) });
    } else if (raw.startsWith('-')) {
      deletions++;
      diffLines.push({ type: 'deleted', oldLineNo: oldNo++, text: raw.slice(1) });
    } else if (raw.startsWith(' ')) {
      diffLines.push({ type: 'context', oldLineNo: oldNo++, newLineNo: newNo++, text: raw.slice(1) });
    }
    lastNewEnd = newNo - 1;
  }

  if (additions === 0 && deletions === 0) return null;
  return { file: filePath, relativePath, additions, deletions, diffLines };
}

/** Diff berkas baru: semua baris berstatus `added`. */
export function wholeFileAdded(content: string, filePath: string, relativePath: string): CodeEditChunk {
  const lines = content.replace(/\r/g, '').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return {
    file: filePath,
    relativePath,
    additions: lines.length,
    deletions: 0,
    diffLines: lines.map((text, i) => ({ type: 'added' as const, newLineNo: i + 1, text })),
  };
}

/**
 * Status `git status --porcelain` berkas yang belum punya versi sebelumnya di git:
 * untracked (`??`), baru di-stage (`A`), atau diabaikan `.gitignore` (`!!`).
 * Output kosong = berkas ter-track tanpa perubahan.
 */
export function isNewFileStatus(porcelain: string): boolean {
  const line = porcelain.trim().split('\n')[0] ?? '';
  return line.startsWith('??') || line.startsWith('!!') || /^A/.test(line);
}

/**
 * Mengambil diff nyata sebuah berkas yang diubah agen (butuh Tauri).
 * `null` = tidak ada perubahan nyata (mis. edit ditolak, atau isi ditulis ulang sama persis).
 */
export async function buildFileChangeDiff(reportedPath: string, projectPath: string): Promise<CodeEditChunk | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  const filePath = absoluteInProject(reportedPath, projectPath);
  const relativePath = relativeToProject(filePath, projectPath);
  const quoted = `'${filePath.replace(/'/g, "''")}'`;
  const git = (args: string) => invoke<string>('run_workspace_terminal', { workspacePath: projectPath, command: `git ${args} -- ${quoted}` });
  try {
    const out = await git('diff --no-color --no-ext-diff');
    if (!out.startsWith('Terminal Error')) {
      const parsed = parseUnifiedDiff(out, filePath, relativePath);
      if (parsed) return parsed;
      // Diff kosong: hanya berkas baru/untracked yang ditampilkan utuh; berkas ter-track berarti tidak berubah.
      const status = await git('status --porcelain --untracked-files=all --ignored');
      if (!status.startsWith('Terminal Error') && !isNewFileStatus(status)) return null;
    }
  } catch {
    // bukan repo git / git tidak tersedia → fallback di bawah
  }
  try {
    const content = await invoke<string>('read_workspace_file', { path: filePath });
    return wholeFileAdded(content, filePath, relativePath);
  } catch {
    return null;
  }
}
