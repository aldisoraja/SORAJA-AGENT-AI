import React from 'react';

// 1. Google Gemini Sparkle Star Icon
export const GeminiIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="gemini-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4daafc" />
        <stop offset="50%" stopColor="#9b72cf" />
        <stop offset="100%" stopColor="#d96570" />
      </linearGradient>
    </defs>
    <path
      d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4771 12 22C12 16.4771 16.4771 12 22 12C16.4771 12 12 7.52285 12 2Z"
      fill="url(#gemini-gradient)"
    />
  </svg>
);

// 2. Anthropic Claude Terracotta Sunburst Icon
export const ClaudeIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M4.5 12a7.5 7.5 0 0 1 7.5-7.5m0 0a7.5 7.5 0 0 1 7.5 7.5m-7.5-7.5v15m7.5-7.5a7.5 7.5 0 0 1-7.5 7.5m0 0a7.5 7.5 0 0 1-7.5-7.5m7.5 7.5H4.5m15 0h-7.5M6.7 6.7l10.6 10.6m-10.6 0L17.3 6.7"
      stroke="#d97757"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

// 3. OpenAI Codex (Official Spiral Rosette) Icon
export const CodexIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M20.5 9.5a5.5 5.5 0 0 0-4.5-4.5M3.5 14.5a5.5 5.5 0 0 0 4.5 4.5m0-14a5.5 5.5 0 0 0-4.5 4.5m17 5a5.5 5.5 0 0 0-4.5 4.5M12 3v18M3 12h18M6.5 6.5l11 11M6.5 17.5l11-11"
      stroke="#10a37f"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 4. Open Code (<> Terminal Brackets) Icon
export const OpenCodeIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      d="M8.5 7.5L4 12L8.5 16.5M15.5 7.5L20 12L15.5 16.5M13.5 5.5L10.5 18.5"
      stroke="#06b6d4"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 5. Google Antigravity (Geometric 'A' Mark) Icon
export const AntigravityIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="antigravity-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#6366f1" />
      </linearGradient>
    </defs>
    <path
      d="M12 2L2 22H7L12 11.5L17 22H22L12 2Z"
      fill="url(#antigravity-gradient)"
    />
    <path
      d="M8.5 15.5H15.5"
      stroke="#ffffff"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const AGENT_ICONS = {
  antigravity: AntigravityIcon,
  gemini: GeminiIcon,
  claude: ClaudeIcon,
  codex: CodexIcon,
  opencode: OpenCodeIcon,
};

export function getAgentIcon(iconNameOrId?: string, className = 'w-5 h-5'): React.ReactNode {
  const key = (iconNameOrId || 'antigravity').toLowerCase();
  const IconComponent = AGENT_ICONS[key as keyof typeof AGENT_ICONS] || AntigravityIcon;
  return <IconComponent className={className} />;
}

