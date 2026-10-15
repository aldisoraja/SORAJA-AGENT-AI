import type { AgentProvider } from '../types/agent';
import { ClaudeIcon, CodexIcon, OpenCodeIcon, AntigravityIcon, KiroIcon } from '../components/AgentIcons';

export const FALLBACK_AGENT_PROVIDERS: AgentProvider[] = [
  {
    id: 'antigravity',
    name: 'Antigravity',
    vendor: 'Google DeepMind (Autonomous Engine)',
    executable: 'agy',
    binaryPath: null, // dideteksi backend (detect_cli)
    isInstalled: true,
    iconName: 'antigravity',
    icon: <AntigravityIcon className="w-5 h-5" />,
    accent: 'from-sky-400 to-indigo-600',
    badgeColor: 'border-sky-500/30 text-sky-400 bg-sky-950/40',
    description: 'Engine Vibe Coding otonom Google Antigravity',
    defaultModelId: 'gemini-3.8-flash-high',
    models: [
      { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash', badge: 'FLASH', speed: 'Ultra', desc: 'Model dari menu /model Antigravity CLI' },
      { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash', badge: 'FLASH', speed: 'Ultra', desc: 'Model dari menu /model Antigravity CLI' },
      { id: 'gemini-3.6-flash-high', name: 'Gemini 3.6 Flash', badge: 'FLASH', speed: 'Ultra', desc: 'Model dari menu /model Antigravity CLI' },
      { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro', badge: 'PRO', speed: 'Native', desc: 'Model dari menu /model Antigravity CLI' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)', badge: 'AGY', speed: 'Native', desc: 'Model dari menu /model Antigravity CLI' },
      { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)', badge: 'AGY', speed: 'Native', desc: 'Model dari menu /model Antigravity CLI' },
      { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)', badge: 'AGY', speed: 'Native', desc: 'Model dari menu /model Antigravity CLI' },
    ],
  },
  {
    id: 'claude',
    name: 'Claude',
    vendor: 'Anthropic',
    executable: 'claude',
    binaryPath: null, // dideteksi backend (detect_cli)
    isInstalled: true,
    iconName: 'claude',
    icon: <ClaudeIcon className="w-5 h-5" />,
    accent: 'from-amber-500 to-orange-600',
    badgeColor: 'border-amber-500/30 text-amber-400 bg-amber-950/40',
    description: 'Claude Code CLI',
    defaultModelId: 'cli-default',
    models: [
      { id: 'cli-default', name: 'Default (recommended)', badge: 'DEFAULT', speed: 'Native', desc: 'Model bawaan akun Anda di Claude Code' },
      { id: 'claude-opus-5-5', name: 'Opus 5.5', badge: 'OPUS', speed: 'Deep', desc: 'Terbaik untuk tugas kompleks sehari-hari' },
      { id: 'claude-fable-5-1', name: 'Fable 5.1', badge: 'FABLE', speed: 'Deep', desc: 'Paling mampu untuk tugas tersulit dan terpanjang' },
      { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', badge: 'SONNET', speed: 'Fast', desc: 'Efisien untuk tugas rutin' },
      { id: 'claude-haiku-5-5', name: 'Haiku 5.5', badge: 'HAIKU', speed: 'Ultra', desc: 'Tercepat untuk jawaban singkat' },
    ],
  },
  {
    id: 'codex',
    name: 'Codex',
    vendor: 'OpenAI',
    executable: 'codex',
    binaryPath: null, // dideteksi backend (detect_cli)
    isInstalled: true,
    iconName: 'codex',
    icon: <CodexIcon className="w-5 h-5" />,
    accent: 'from-emerald-500 to-teal-600',
    badgeColor: 'border-emerald-500/30 text-emerald-400 bg-emerald-950/40',
    description: 'OpenAI Codex CLI untuk automasi kode bertahap',
    defaultModelId: 'gpt-6-luna',
    models: [
      { id: 'gpt-6-luna', name: 'GPT-6-Luna', badge: 'CODEX', speed: 'Native', desc: 'Model dari menu /model Codex CLI' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6-Terra', badge: 'CODEX', speed: 'Native', desc: 'Model dari menu /model Codex CLI' },
      { id: 'gpt-5.6-luna', name: 'GPT-5.6-Luna', badge: 'CODEX', speed: 'Native', desc: 'Model dari menu /model Codex CLI' },
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    vendor: 'OpenCode Community (Self-Hosted)',
    executable: 'opencode',
    binaryPath: null, // dideteksi backend (detect_cli)
    isInstalled: true,
    iconName: 'opencode',
    icon: <OpenCodeIcon className="w-5 h-5" />,
    accent: 'from-purple-500 to-indigo-600',
    badgeColor: 'border-purple-500/30 text-purple-400 bg-purple-950/40',
    description: 'Terminal coding multi-provider dengan puluhan model live',
    defaultModelId: 'dwidasa/coding',
    models: [
      {
        id: 'dwidasa/coding',
        name: 'Dwidasa Coding (Default)',
        badge: 'DWIDASA',
        speed: 'Super Fast',
        desc: 'Model coding utama Dwidasa AI aktif lokal tanpa batasan region',
      },
      {
        id: 'dwidasa/chat',
        name: 'Dwidasa Chat',
        badge: 'DWIDASA',
        speed: 'Fast',
        desc: 'Model percakapan cepat dan tanya jawab Dwidasa AI',
      },
      {
        id: 'opencode-go/deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        badge: 'OPENCODE-GO',
        speed: 'Super Fast',
        desc: 'Model reasoning OpenCode Go (memerlukan region Global)',
      },
      {
        id: 'opencode-go/deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        badge: 'OPENCODE-GO',
        speed: 'Native',
        desc: 'Model penalaran kompleks OpenCode Go (memerlukan region Global)',
      },
      {
        id: 'opencode-go/glm-5.3',
        name: 'GLM 5.3',
        badge: 'ZHIPU',
        speed: 'Native',
        desc: 'Model penalaran coding tingkat lanjut',
      },
      {
        id: 'opencode-go/qwen3.8-max',
        name: 'Qwen 3.8 Max',
        badge: 'ALIBABA',
        speed: 'Fast',
        desc: 'Model multi-tugas performa tinggi',
      },
      {
        id: 'opencode/big-pickle',
        name: 'Big Pickle',
        badge: 'OPENCODE',
        speed: 'Ultra',
        desc: 'Model lokal serbaguna OpenCode Community',
      },
    ],
  },
  {
    id: 'kiro',
    name: 'Kiro',
    vendor: 'Amazon Web Services',
    executable: 'kiro-cli',
    binaryPath: null, // dideteksi backend (detect_cli)
    isInstalled: true,
    iconName: 'kiro',
    icon: <KiroIcon className="w-5 h-5" />,
    accent: 'from-violet-500 to-purple-700',
    badgeColor: 'border-violet-500/30 text-violet-300 bg-violet-950/40',
    description: 'Kiro CLI (AWS): agen spec-driven dengan mode headless',
    defaultModelId: 'cli-default',
    models: [
      { id: 'cli-default', name: 'Default (Kiro)', badge: 'DEFAULT', speed: 'Native', desc: 'Model bawaan/konfigurasi Kiro CLI' },
    ],
  },
];

export function getFallbackAgentProviders(): AgentProvider[] {
  return FALLBACK_AGENT_PROVIDERS;
}

// Fallback constant for synchronous initializations
export const AGENT_PROVIDERS: AgentProvider[] = FALLBACK_AGENT_PROVIDERS;

export const PROJECT_WORKSPACE_FILES = [
  'Cargo.toml',
  'src/main.rs',
  'specs/prd.md',
  'specs/ipc-contracts.md',
  'specs/agent-protocols.md',
  'specs/database-schema.sql',
  'package.json',
  'README.md',
  'crates/soraja-core/src/db.rs',
  'crates/soraja-core/src/auth.rs',
  'crates/soraja-core/src/agent_runner.rs',
  'desktop-ui/src/App.tsx',
  'desktop-ui/src/services/db.ts',
  'desktop-ui/src/index.css',
];

export const SLASH_COMMANDS = [
  { cmd: '/plan', label: 'Rancang Rencana Bertahap', desc: 'Analisis arsitektur mendalam sebelum modifikasi kode' },
  { cmd: '/goal', label: 'Mode Otonom Penuh', desc: 'Agen bekerja mandiri hingga tujuan 100% selesai' },
  { cmd: '/boost', label: 'Multi-Perspective Thinking', desc: 'Evaluasi solusi dari beragam sudut pandang engineer' },
  { cmd: '/browser', label: 'Web Search & Documentation', desc: 'Riset referensi crate dan API online terkini' },
];

export const SETTINGS_CATEGORIES = [
  { id: 'General', label: 'Umum' },
  { id: 'Appearance', label: 'Tampilan' },
  { id: 'Models', label: 'Akun & Kuota AI' },
  { id: 'Data', label: 'Data & Bantuan' },
];

export const THEME_PRESETS: Record<
  string,
  { bg: string; fg: string; accent: string; label: string; modalBg: string; modalSidebar: string }
> = {
  'Default Dark': {
    bg: '#07090e',
    fg: '#e2e8f0',
    accent: '#06b6d4',
    label: 'Default Cyber Dark',
    modalBg: '#0c101a',
    modalSidebar: '#0b0e17',
  },
  'Midnight Aurora': {
    bg: '#0b1120',
    fg: '#e0e7ff',
    accent: '#3b82f6',
    label: 'Midnight Aurora',
    modalBg: '#0f172a',
    modalSidebar: '#0d1527',
  },
  'Deep Space Violet': {
    bg: '#0d0b18',
    fg: '#f3e8ff',
    accent: '#8b5cf6',
    label: 'Deep Space Violet',
    modalBg: '#161226',
    modalSidebar: '#120e20',
  },
  'Emerald Terminal': {
    bg: '#04110a',
    fg: '#d1fae5',
    accent: '#10b981',
    label: 'Emerald Terminal',
    modalBg: '#081a10',
    modalSidebar: '#05140d',
  },
  'Solar Amber': {
    bg: '#140d07',
    fg: '#fef3c7',
    accent: '#f59e0b',
    label: 'Solar Amber',
    modalBg: '#1c140c',
    modalSidebar: '#170f08',
  },
};

export const LIGHT_THEME_PRESETS: Record<
  string,
  { bg: string; fg: string; accent: string; label: string; modalBg: string; modalSidebar: string }
> = {
  'Sapphire Horizon': {
    bg: '#f8fafc',
    fg: '#0f172a',
    accent: '#2563eb',
    label: 'Sapphire Horizon',
    modalBg: '#ffffff',
    modalSidebar: '#f8fafc',
  },
  'Ethereal Iris': {
    bg: '#faf5ff',
    fg: '#1e1b4b',
    accent: '#7c3aed',
    label: 'Ethereal Iris',
    modalBg: '#ffffff',
    modalSidebar: '#f5f3ff',
  },
  'Emerald Breeze': {
    bg: '#f0fdf4',
    fg: '#064e3b',
    accent: '#059669',
    label: 'Emerald Breeze',
    modalBg: '#ffffff',
    modalSidebar: '#ecfdf5',
  },
  'Rose Quartz': {
    bg: '#fff1f2',
    fg: '#4c0519',
    accent: '#e11d48',
    label: 'Rose Quartz',
    modalBg: '#ffffff',
    modalSidebar: '#ffe4e6',
  },
  'Titanium Pearl': {
    bg: '#f1f5f9',
    fg: '#1e293b',
    accent: '#0284c7',
    label: 'Titanium Pearl',
    modalBg: '#ffffff',
    modalSidebar: '#e2e8f0',
  },
};
