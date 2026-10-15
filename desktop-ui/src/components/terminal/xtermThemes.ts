export const LIGHT_XTERM_THEME = {
  background: '#f8fafc',
  foreground: '#0f172a',
  cursor: '#0284c7',
  selectionBackground: '#bae6fd',
  black: '#0f172a',
  brightBlack: '#64748b',
  red: '#e11d48',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#cbd5e1',
  // Varian "bright" default xterm terlalu neon di latar terang → pakai nada yang lebih pekat.
  brightRed: '#be123c',
  brightGreen: '#15803d',
  brightYellow: '#a16207',
  brightBlue: '#1d4ed8',
  brightMagenta: '#7e22ce',
  brightCyan: '#0e7490',
  brightWhite: '#94a3b8',
};

export const DARK_XTERM_THEME = {
  background: '#090d16',
  foreground: '#e2e8f0',
  cursor: '#38bdf8',
  selectionBackground: '#0369a1',
  black: '#1e293b',
  brightBlack: '#64748b',
  red: '#f43f5e',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#f8fafc',
};

export function xtermTheme(isLight: boolean) {
  return isLight ? LIGHT_XTERM_THEME : DARK_XTERM_THEME;
}

/** Tema terang: xterm otomatis menggelapkan warna teks yang kontrasnya kurang (mis. sintaks tema gelap). */
export function minimumContrastFor(isLight: boolean): number {
  return isLight ? 4.5 : 1;
}

export function fontSizeForZoom(zoomLevel: number): number {
  return Math.max(9, Math.round((13 * zoomLevel) / 100));
}
