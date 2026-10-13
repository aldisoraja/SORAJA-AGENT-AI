import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'soraja_terminal_zoom';
const MIN_ZOOM = 70;
const MAX_ZOOM = 180;

function persist(value: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {}
}

/** Zoom terminal 70%–180% dengan persistensi localStorage & shortcut global Ctrl +/-/0. */
export function useTerminalZoom(showToast: (msg: string) => void) {
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    try {
      const val = parseInt(localStorage.getItem(STORAGE_KEY) || '', 10);
      if (!isNaN(val) && val >= MIN_ZOOM && val <= MAX_ZOOM) return val;
    } catch {}
    return 100;
  });

  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => {
      const next = Math.min(prev + 10, MAX_ZOOM);
      persist(next);
      showToast(`🔍 Zoom Diperbesar: ${next}%`);
      return next;
    });
  }, [showToast]);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const next = Math.max(prev - 10, MIN_ZOOM);
      persist(next);
      showToast(`🔍 Zoom Diperkecil: ${next}%`);
      return next;
    });
  }, [showToast]);

  const handleResetZoom = useCallback(() => {
    setZoomLevel(100);
    persist(100);
    showToast('🔍 Zoom Direset: 100%');
  }, [showToast]);

  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0' || e.code === 'Numpad0') {
        e.preventDefault();
        handleResetZoom();
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [handleZoomIn, handleZoomOut, handleResetZoom]);

  return { zoomLevel, handleZoomIn, handleZoomOut, handleResetZoom, MIN_ZOOM, MAX_ZOOM };
}
