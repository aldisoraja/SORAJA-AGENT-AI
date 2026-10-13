import { useState, useEffect, useCallback } from 'react';
import type { ProjectRecord } from '../services/db';
import {
  scanWorkspaceFiles,
  setActiveDirectoryHandle,
} from '../services/workspaceFileService';

export function useWorkspaceFiles(activeProject: ProjectRecord | null) {
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);
  const [isScanningFiles, setIsScanningFiles] = useState(false);

  const refreshFiles = useCallback(
    async (projectPath?: string, dirHandle?: FileSystemDirectoryHandle | null) => {
      const targetPath = projectPath || activeProject?.path;
      if (!targetPath) return [];

      setIsScanningFiles(true);
      try {
        if (dirHandle) {
          setActiveDirectoryHandle(dirHandle);
        }
        const files = await scanWorkspaceFiles(targetPath, dirHandle);
        setWorkspaceFiles(files);
        return files;
      } catch (err) {
        console.warn('Gagal memindai berkas workspace:', err);
        return [];
      } finally {
        setIsScanningFiles(false);
      }
    },
    [activeProject?.path]
  );

  useEffect(() => {
    if (activeProject?.path) {
      refreshFiles(activeProject.path);
    } else {
      setWorkspaceFiles([]);
    }
  }, [activeProject?.path, refreshFiles]);

  return {
    workspaceFiles,
    isScanningFiles,
    refreshFiles,
    setWorkspaceFiles,
  };
}
