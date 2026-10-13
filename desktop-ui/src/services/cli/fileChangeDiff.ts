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

/** Mengambil diff nyata sebuah berkas yang diubah agen (butuh Tauri). */
export async function buildFileChangeDiff(filePath: string, projectPath: string): Promise<CodeEditChunk | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  const relativePath = relativeToProject(filePath, projectPath);
  const quoted = `'${filePath.replace(/'/g, "''")}'`;
  try {
    const out = await invoke<string>('run_workspace_terminal', {
      workspacePath: projectPath,
      command: `git diff --no-color --no-ext-diff -- ${quoted}`,
    });
    if (!out.startsWith('Terminal Error')) {
      const parsed = parseUnifiedDiff(out, filePath, relativePath);
      if (parsed) return parsed;
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
