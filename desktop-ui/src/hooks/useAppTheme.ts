import { useEffect } from 'react';
import type { AppSettings } from '../types/database';
import { THEME_PRESETS, LIGHT_THEME_PRESETS } from '../constants/agentProviders';

export function useAppTheme(settings: AppSettings | null) {
  const isSystemDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const activeThemeMode = settings?.theme || 'dark';
  const isLight = activeThemeMode === 'light' || (activeThemeMode === 'system' && !isSystemDark);
  const isHighContrast = settings?.contrast === 'strong';

  const defaultPresetName = isLight ? 'Sapphire Horizon' : 'Default Dark';
  const presetKey = settings?.themePreset || defaultPresetName;
  const currentPresetData = isLight
    ? (LIGHT_THEME_PRESETS[presetKey] || LIGHT_THEME_PRESETS['Sapphire Horizon'])
    : (THEME_PRESETS[presetKey] || THEME_PRESETS['Default Dark']);

  // For light theme, ensure background, foreground, and accent are harmonious
  const currentBg = isLight
    ? '#f8fafc'
    : (settings?.backgroundColor || currentPresetData.bg);
  const currentFg = isLight
    ? '#0f172a'
    : (settings?.foregroundColor || currentPresetData.fg);
  const currentAccent = isLight
    ? (settings?.accentColor && settings.accentColor !== '#06b6d4' ? settings.accentColor : currentPresetData.accent)
    : (settings?.accentColor || currentPresetData.accent);
  const currentModalBg = isLight ? '#ffffff' : currentPresetData.modalBg;
  const currentModalSidebar = isLight ? '#f8fafc' : currentPresetData.modalSidebar;

  useEffect(() => {
    const root = document.documentElement;
    if (isLight) {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }

    if (isHighContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    root.style.setProperty('--app-bg', currentBg);
    root.style.setProperty('--app-fg', currentFg);
    root.style.setProperty('--app-accent', currentAccent);
    document.body.style.backgroundColor = currentBg;
    document.body.style.color = currentFg;
  }, [isLight, isHighContrast, currentBg, currentFg, currentAccent]);

  return {
    isLight,
    isHighContrast,
    currentBg,
    currentFg,
    currentAccent,
    currentModalBg,
    currentModalSidebar,
  };
}
