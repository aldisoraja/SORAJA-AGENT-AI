import { invokeTauri } from './agentVibeCoding';
import { PROJECT_WORKSPACE_FILES } from '../constants/agentProviders';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// In-memory reference to the opened directory handle in web/browser mode
let activeDirectoryHandle: FileSystemDirectoryHandle | null = null;

export function setActiveDirectoryHandle(handle: FileSystemDirectoryHandle | null) {
  activeDirectoryHandle = handle;
}

export function getActiveDirectoryHandle(): FileSystemDirectoryHandle | null {
  return activeDirectoryHandle;
}

const IGNORED_NAMES = new Set([
  'node_modules',
  'target',
  'dist',
  'build',
  '.git',
  '.gemini',
  '.vscode',
  '.idea',
  '.turbo',
  'coverage',
]);

/**
 * Recursively scans a FileSystemDirectoryHandle up to maxDepth.
 */
async function scanHandleRecursively(
  handle: FileSystemDirectoryHandle,
  currentRelPath: string,
  depth: number,
  results: string[],
  maxDepth = 8
): Promise<void> {
  if (depth > maxDepth) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const entry of (handle as any).values()) {
      const name: string = entry.name;
      if (name.startsWith('.') || IGNORED_NAMES.has(name)) {
        continue;
      }

      const itemPath = currentRelPath ? `${currentRelPath}/${name}` : name;
      if (entry.kind === 'file') {
        results.push(itemPath);
      } else if (entry.kind === 'directory') {
        await scanHandleRecursively(entry as FileSystemDirectoryHandle, itemPath, depth + 1, results, maxDepth);
      }
    }
  } catch (err) {
    console.warn('Gagal membaca direktori handle:', err);
  }
}

/**
 * Lists all files in the active workspace at any depth (up to 8 levels).
 * Works seamlessly in Tauri IPC and Browser FileSystem API.
 */
export async function scanWorkspaceFiles(
  projectPath: string,
  handle?: FileSystemDirectoryHandle | null
): Promise<string[]> {
  const dirHandle = handle || activeDirectoryHandle;

  // 1. Try Tauri backend if available
  if (isTauri && projectPath) {
    try {
      const files = await invokeTauri<string[]>('list_workspace_files', { basePath: projectPath });
      if (files && files.length > 0) {
        return files.sort();
      }
    } catch (err) {
      console.warn('Tauri list_workspace_files error:', err);
    }
  }

  // 2. Try Web FileSystemDirectoryHandle if available
  if (dirHandle) {
    try {
      const results: string[] = [];
      await scanHandleRecursively(dirHandle, '', 0, results, 8);
      if (results.length > 0) {
        return results.sort();
      }
    } catch (err) {
      console.warn('Web FileSystemDirectoryHandle scan error:', err);
    }
  }

  // 3. Fallback to default indexed files
  return [...PROJECT_WORKSPACE_FILES];
}

/**
 * Sanitizes relative paths to guarantee airtight isolation inside the workspace.
 * Strips directory traversal sequences (`..`), null bytes, and leading slashes.
 */
export function sanitizeWorkspaceRelativePath(relPath: string): string {
  return relPath
    .replace(/\0/g, '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(segment => segment !== '' && segment !== '.' && segment !== '..')
    .join('/');
}

/**
 * Reads the actual content of a file from the active workspace.
 */
export async function readWorkspaceFile(
  projectPath: string,
  relativePath: string,
  handle?: FileSystemDirectoryHandle | null
): Promise<string | null> {
  const normalizedRel = sanitizeWorkspaceRelativePath(relativePath);
  if (!normalizedRel) return null;
  const dirHandle = handle || activeDirectoryHandle;

  // 1. Tauri environment: direct filesystem read
  if (isTauri && projectPath) {
    try {
      const cleanBase = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
      const fullPath = `${cleanBase}/${normalizedRel}`;
      const content = await invokeTauri<string>('read_workspace_file', { path: fullPath });
      if (typeof content === 'string') {
        return content;
      }
    } catch (err) {
      console.warn(`Tauri read_workspace_file error for ${normalizedRel}:`, err);
    }
  }

  // 2. Browser FileSystem API
  if (dirHandle) {
    try {
      const parts = normalizedRel.split('/').filter(Boolean);
      let currentDir = dirHandle;
      for (let i = 0; i < parts.length - 1; i++) {
        currentDir = await currentDir.getDirectoryHandle(parts[i]);
      }
      const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1]);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (err) {
      console.warn(`Browser getFileHandle error for ${normalizedRel}:`, err);
    }
  }

  return null;
}

/**
 * Writes content to a file in the active workspace.
 */
export async function writeWorkspaceFile(
  projectPath: string,
  relativePath: string,
  content: string,
  handle?: FileSystemDirectoryHandle | null
): Promise<boolean> {
  const normalizedRel = sanitizeWorkspaceRelativePath(relativePath);
  if (!normalizedRel) return false;
  const dirHandle = handle || activeDirectoryHandle;

  // 1. Tauri environment: direct filesystem write
  if (isTauri && projectPath) {
    try {
      const cleanBase = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
      const fullPath = `${cleanBase}/${normalizedRel}`;
      await invokeTauri('write_workspace_file', { path: fullPath, content });
      return true;
    } catch (err) {
      console.warn(`Tauri write_workspace_file error for ${normalizedRel}:`, err);
    }
  }

  // 2. Browser FileSystem API
  if (dirHandle) {
    try {
      const parts = normalizedRel.split('/').filter(Boolean);
      let currentDir = dirHandle;
      for (let i = 0; i < parts.length - 1; i++) {
        currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
      }
      const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const writable = await (fileHandle as any).createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (err) {
      console.warn(`Browser createWritable error for ${normalizedRel}:`, err);
    }
  }

  return false;
}

/**
 * Formats a clean ASCII tree representation from an array of relative file paths.
 */
export function formatWorkspaceTree(files: string[], projectName: string): string {
  if (!files || files.length === 0) return `${projectName}/\n(tidak ada berkas)`;

  const tree: Record<string, any> = {};
  for (const f of files) {
    const parts = f.split('/');
    let cur = tree;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === parts.length - 1) {
        cur[p] = null; // file
      } else {
        cur[p] = cur[p] || {};
        cur = cur[p];
      }
    }
  }

  const lines: string[] = [`${projectName}/`];

  function buildLines(node: Record<string, any>, prefix: string) {
    const keys = Object.keys(node);
    keys.forEach((key, index) => {
      const isLast = index === keys.length - 1;
      const pointer = isLast ? '└── ' : '├── ';
      const isFile = node[key] === null;

      lines.push(`${prefix}${pointer}${key}${isFile ? '' : '/'}`);
      if (!isFile) {
        buildLines(node[key], `${prefix}${isLast ? '    ' : '│   '}`);
      }
    });
  }

  buildLines(tree, '');
  return lines.slice(0, 50).join('\n') + (lines.length > 50 ? `\n... (+${lines.length - 50} berkas lainnya)` : '');
}
