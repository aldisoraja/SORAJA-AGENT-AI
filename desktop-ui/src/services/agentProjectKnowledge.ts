import type { AgentProvider, ModelItem } from '../types/agent';

/**
 * Known project index for fast and accurate project comprehension.
 */
export const PROJECT_FILE_INDEX: Record<string, { relativePath: string; summary: string }> = {
  'cargo.toml': { relativePath: 'Cargo.toml', summary: 'Root Cargo workspace configuration (soraja-core, soraja-desktop, soraja-cli).' },
  'package.json': { relativePath: 'package.json', summary: 'Root pnpm monorepo dependencies and scripts.' },
  'readme.md': { relativePath: 'README.md', summary: 'Project documentation and architectural overview.' },
  'main.rs': { relativePath: 'crates/soraja-desktop/src/main.rs', summary: 'Tauri v2 application entrypoint & IPC commands.' },
  'lib.rs': { relativePath: 'crates/soraja-core/src/lib.rs', summary: 'Soraja Core library exports.' },
  'db.rs': { relativePath: 'crates/soraja-core/src/db.rs', summary: 'SQLite database connection pool and WAL mode setup.' },
  'auth.rs': { relativePath: 'crates/soraja-core/src/auth.rs', summary: 'Windows DPAPI / keyring credential storage.' },
  'mcp_tools.rs': { relativePath: 'crates/soraja-core/src/mcp_tools.rs', summary: 'Model Context Protocol (MCP) tool definitions and HITL terminal guardrails.' },
  'skills.rs': { relativePath: 'crates/soraja-core/src/skills.rs', summary: 'Skill registry, token budgeting, and SOP system prompt builder.' },
  'agent_runner.rs': { relativePath: 'crates/soraja-core/src/agent_runner.rs', summary: 'Asynchronous task runner and state machine for agent sessions.' },
  'llm_adapters.rs': { relativePath: 'crates/soraja-core/src/llm_adapters.rs', summary: 'LlmProvider trait and adapter implementations for Gemini/Claude/OpenAI.' },
  'app.tsx': { relativePath: 'desktop-ui/src/App.tsx', summary: 'Main React layout, workspace shell, modals, and hotkeys.' },
  'sidebar.tsx': { relativePath: 'desktop-ui/src/components/sidebar/Sidebar.tsx', summary: 'Navigation sidebar with collapsible rail, project list, and active context.' },
  'sidebarheader.tsx': { relativePath: 'desktop-ui/src/components/sidebar/SidebarHeader.tsx', summary: 'Antigravity menu strip, toggle button (Ctrl+B), brand mark, and history arrows.' },
  'sidebarcollapsedrail.tsx': { relativePath: 'desktop-ui/src/components/sidebar/SidebarCollapsedRail.tsx', summary: 'Collapsed slim 58px sidebar rail with quick action buttons.' },
  'header.tsx': { relativePath: 'desktop-ui/src/components/header/Header.tsx', summary: 'Top application header with toggle sidebar button and project breadcrumbs.' },
  'chatfeed.tsx': { relativePath: 'desktop-ui/src/components/chat/ChatFeed.tsx', summary: 'Chat message feed, reasoning collapsible, and trajectory cards.' },
  'chatinputbar.tsx': { relativePath: 'desktop-ui/src/components/chat/ChatInputBar.tsx', summary: 'Chat input bar, 10-image paste handler, slash commands, and submit buttons.' },
  'modelselectordropdown.tsx': { relativePath: 'desktop-ui/src/components/chat/ModelSelectorDropdown.tsx', summary: 'Model picker per agent with checkmark indicators.' },
  'settingsmodal.tsx': { relativePath: 'desktop-ui/src/components/settings/SettingsModal.tsx', summary: 'Settings modal dialog with General, Appearance, and Models (CLI accounts & quota) tabs.' },
  'diffreviewpanel.tsx': { relativePath: 'desktop-ui/src/components/diff/DiffReviewPanel.tsx', summary: 'Interactive code diff viewer with side-by-side / unified hunk inspection.' },
  'agentengine.ts': { relativePath: 'desktop-ui/src/services/agentEngine.ts', summary: 'Intelligent multi-agent engine, Vibe Coding, and live LLM callers.' },
  'db.ts': { relativePath: 'desktop-ui/src/services/db.ts', summary: 'Persistent database service (SQLite WAL & IndexedDB storage).' },
};

/**
 * Accurately extracts a referenced project file from the user's prompt.
 */
export function findReferencedFile(
  prompt: string,
  workspaceFiles: string[] = []
): { key: string; relativePath: string; summary: string } | null {
  const lower = prompt.toLowerCase();
  
  if (lower.includes('sidebar') || lower.includes('navbar') || lower.includes('toggle sidebar')) {
    return {
      key: 'sidebarheader.tsx',
      relativePath: 'desktop-ui/src/components/sidebar/SidebarHeader.tsx',
      summary: 'Komponen header sidebar dengan Antigravity menu strip, toggle button [|], dan navigasi history.',
    };
  }

  // 1. Scan dynamically through live workspaceFiles if available!
  if (workspaceFiles.length > 0) {
    const fileWordMatch = prompt.match(/(?:file|berkas|dokumen|path)\s+["'`]?([a-zA-Z0-9_\-./\\]+)["'`]?/i);
    const candidateTarget = fileWordMatch
      ? fileWordMatch[1].replace(/\\/g, '/').toLowerCase().trim().replace(/[.,:;!?]+$/, '')
      : '';

    for (const relPath of workspaceFiles) {
      const lowerRel = relPath.toLowerCase();
      const fileName = lowerRel.split('/').pop() || lowerRel;
      const baseName = fileName.split('.')[0];

      if (
        (candidateTarget &&
          (lowerRel === candidateTarget ||
            lowerRel.endsWith(`/${candidateTarget}`) ||
            fileName === candidateTarget ||
            baseName === candidateTarget)) ||
        lower.includes(lowerRel) ||
        lower.includes(fileName) ||
        lower.includes(` ${fileName} `) ||
        lower.includes(` ${baseName} `) ||
        lower.includes(` ${baseName}.`) ||
        lower.endsWith(` ${baseName}`) ||
        lower.endsWith(` ${baseName}.`)
      ) {
        return {
          key: fileName,
          relativePath: relPath,
          summary: `Berkas proyek di workspace: ${relPath}`,
        };
      }
    }
  }

  // 1. Cek explicit file pattern: "file readme", "pada berkas readme", "file App.tsx", dll
  const fileWordMatch = prompt.match(/(?:file|berkas|dokumen|path)\s+["'`]?([a-zA-Z0-9_\-./\\]+)["'`]?/i);
  if (fileWordMatch) {
    const rawTarget = fileWordMatch[1].replace(/\\/g, '/').toLowerCase().trim();
    const cleanTarget = rawTarget.replace(/[.,:;!?]+$/, '');

    for (const [key, info] of Object.entries(PROJECT_FILE_INDEX)) {
      const baseKey = key.split('.')[0];
      if (key === cleanTarget || baseKey === cleanTarget || info.relativePath.toLowerCase().includes(cleanTarget)) {
        return { key, ...info };
      }
    }
    if (cleanTarget.includes('.')) {
      return {
        key: cleanTarget,
        relativePath: cleanTarget,
        summary: `Berkas target ${cleanTarget}`,
      };
    }
  }

  // 2. Cek index dengan key atau baseKey tanpa ekstensi
  for (const [key, info] of Object.entries(PROJECT_FILE_INDEX)) {
    const baseKey = key.split('.')[0];
    if (
      lower.includes(key) ||
      lower.includes(info.relativePath.toLowerCase()) ||
      lower.includes(` ${baseKey} `) ||
      lower.includes(` ${baseKey}.`) ||
      lower.includes(` "${baseKey}"`) ||
      lower.includes(` '${baseKey}'`) ||
      lower.endsWith(` ${baseKey}`) ||
      lower.endsWith(` ${baseKey}.`) ||
      lower.startsWith(`${baseKey} `) ||
      lower === baseKey
    ) {
      return { key, ...info };
    }
  }

  // 3. Fallback regex untuk ekstensi file umum
  const match = prompt.match(/([a-zA-Z0-9_\-./\\]+\.(tsx|ts|rs|toml|json|md|css|html))/i);
  if (match) {
    const rawPath = match[1].replace(/\\/g, '/');
    const fileName = rawPath.split('/').pop()?.toLowerCase() || '';
    if (PROJECT_FILE_INDEX[fileName]) {
      return { key: fileName, ...PROJECT_FILE_INDEX[fileName] };
    }
    return {
      key: fileName,
      relativePath: rawPath,
      summary: `Berkas kode proyek ${rawPath}`,
    };
  }
  return null;
}

/**
 * Determines whether the user prompt requests active coding / modification.
 */
export function isCodingInstruction(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    lower.includes('tambah') ||
    lower.includes('buat') ||
    lower.includes('ubah') ||
    lower.includes('ganti') ||
    lower.includes('bikin') ||
    lower.includes('refactor') ||
    lower.includes('perbaiki') ||
    lower.includes('fix') ||
    lower.includes('pasang') ||
    lower.includes('implementasi') ||
    lower.includes('modifikasi') ||
    lower.includes('toggle') ||
    lower.includes('sidebar') ||
    lower.includes('navbar') ||
    lower.includes('komponen') ||
    lower.includes('styling') ||
    lower.includes('tampilan') ||
    lower.includes('fitur') ||
    lower.includes('code') ||
    lower.includes('kode') ||
    lower.includes('tombol') ||
    lower.includes('button')
  );
}

/**
 * Generates response persona tailored to the specific agent provider.
 */
export function getAgentPersonaHeader(agent: AgentProvider, model: ModelItem): string {
  if (agent.id === 'antigravity') {
    return `[Google Antigravity Autonomous Engine]\n- Provider: ${agent.name} (${model.name})\n- Eksekusi: Otonom Nyata (Real Filesystem AST, Live Diff Review, Terminal Sandboxing).\n`;
  }
  if (agent.id === 'claude') {
    return `[Anthropic Extended Thinking]\n- Provider: ${agent.name} (${model.name})\n- Persona: Rekayasa perangkat lunak ketat, verifikasi batasan sistem, dan arsitektur modular.\n`;
  }
  if (agent.id === 'codex') {
    return `[OpenAI Reasoning Engine]\n- Provider: ${agent.name} (${model.name})\n- Persona: Presisi algoritma, pola DRY, dan komputasi langkah-demi-langkah.\n`;
  }
  if (agent.id === 'opencode') {
    return `[DeepSeek-R1 / Qwen Open-Weights Engine]\n<think>\n- Provider: ${agent.name} (${model.name})\n- Eksekusi: Lokal & Open-Weights. Zero cloud telemetry. Memproses konteks di mesin host.\n</think>\n`;
  }
  return `[Google DeepMind High-Speed Vibe Engine]\n- Provider: ${agent.name} (${model.name})\n- Kecepatan: ${model.speed} • Latensi Respons: Instan\n`;
}
