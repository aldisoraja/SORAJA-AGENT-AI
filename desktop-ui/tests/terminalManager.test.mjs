import test from 'node:test';
import assert from 'node:assert/strict';

// Standalone test suite for Terminal Manager & Agent Synchronization logic

const MOCK_AGENTS = [
  { id: 'antigravity', name: 'Google Antigravity', executable: 'agy', models: [{ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' }] },
  { id: 'claude', name: 'Claude Code', executable: 'claude', models: [{ id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet' }] },
  { id: 'opencode', name: 'OpenCode AI', executable: 'opencode', models: [{ id: 'opencode-default', name: 'OpenCode Live' }] },
  { id: 'codex', name: 'OpenAI Codex', executable: 'codex', models: [{ id: 'gpt-4.5', name: 'GPT 4.5' }] },
];

function createTerminalManager(initialAgent, initialPath) {
  let tabs = [
    {
      id: `tab-${initialAgent.id}`,
      sessionId: `pty-${initialAgent.id}-${Date.now()}`,
      agent: initialAgent,
      projectPath: initialPath,
      isRunning: true,
      exitCode: null,
      createdAt: Date.now(),
    },
  ];
  let activeTabId = `tab-${initialAgent.id}`;

  const openTab = (agent, projectPath) => {
    const existing = tabs.find((t) => t.agent.id === agent.id && t.projectPath === projectPath);
    if (existing) {
      activeTabId = existing.id;
      return existing;
    }
    const tabId = `tab-${agent.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTab = {
      id: tabId,
      sessionId: `pty-${agent.id}-${Date.now()}`,
      agent,
      projectPath,
      isRunning: true,
      exitCode: null,
      createdAt: Date.now(),
    };
    tabs.push(newTab);
    activeTabId = tabId;
    return newTab;
  };

  const closeTab = (tabId) => {
    tabs = tabs.filter((t) => t.id !== tabId);
    if (tabs.length > 0 && activeTabId === tabId) {
      activeTabId = tabs[tabs.length - 1].id;
    }
  };

  const restartTab = (tabId) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      tab.sessionId = `pty-${tab.agent.id}-${Date.now()}-restarted`;
      tab.isRunning = true;
      tab.exitCode = null;
    }
  };

  return {
    getTabs: () => tabs,
    getActiveTabId: () => activeTabId,
    getActiveTab: () => tabs.find((t) => t.id === activeTabId),
    openTab,
    closeTab,
    restartTab,
    setActiveTabId: (id) => { activeTabId = id; },
  };
}

test('Terminal Manager: Initializes with 1 active tab for selected agent', () => {
  const tm = createTerminalManager(MOCK_AGENTS[0], 'D:/Workspace/RepoA');
  assert.equal(tm.getTabs().length, 1);
  assert.equal(tm.getActiveTab()?.agent.id, 'antigravity');
  assert.equal(tm.getActiveTab()?.projectPath, 'D:/Workspace/RepoA');
});

test('Terminal Manager: Opening a different agent creates a new tab and activates it', () => {
  const tm = createTerminalManager(MOCK_AGENTS[0], 'D:/Workspace/RepoA');
  tm.openTab(MOCK_AGENTS[1], 'D:/Workspace/RepoA');

  assert.equal(tm.getTabs().length, 2);
  assert.equal(tm.getActiveTab()?.agent.id, 'claude');
});

test('Terminal Manager: Opening the same agent in same repo switches focus without duplicating', () => {
  const tm = createTerminalManager(MOCK_AGENTS[0], 'D:/Workspace/RepoA');
  tm.openTab(MOCK_AGENTS[1], 'D:/Workspace/RepoA');
  assert.equal(tm.getTabs().length, 2);

  // Try opening Antigravity again on RepoA
  tm.openTab(MOCK_AGENTS[0], 'D:/Workspace/RepoA');
  assert.equal(tm.getTabs().length, 2, 'Should not duplicate tab');
  assert.equal(tm.getActiveTab()?.agent.id, 'antigravity', 'Should focus existing Antigravity tab');
});

test('Terminal Manager (Multi-Repo): Opening same agent on DIFFERENT folder creates separate sessions', () => {
  const tm = createTerminalManager(MOCK_AGENTS[0], 'D:/Workspace/RepoA');
  
  // Open Antigravity on RepoB
  tm.openTab(MOCK_AGENTS[0], 'D:/Workspace/RepoB');
  assert.equal(tm.getTabs().length, 2, 'Multi-repo must allow multiple sessions of same agent in different folders');
  assert.equal(tm.getActiveTab()?.projectPath, 'D:/Workspace/RepoB');

  // Verify both exist
  const repoATab = tm.getTabs().find((t) => t.projectPath === 'D:/Workspace/RepoA');
  const repoBTab = tm.getTabs().find((t) => t.projectPath === 'D:/Workspace/RepoB');
  assert.ok(repoATab);
  assert.ok(repoBTab);
});

test('Terminal Manager: Closing active tab properly activates remaining tab', () => {
  const tm = createTerminalManager(MOCK_AGENTS[0], 'D:/Workspace/RepoA');
  tm.openTab(MOCK_AGENTS[1], 'D:/Workspace/RepoA');
  assert.equal(tm.getActiveTab()?.agent.id, 'claude');

  // Close Claude
  const claudeTabId = tm.getActiveTabId();
  tm.closeTab(claudeTabId);

  assert.equal(tm.getTabs().length, 1);
  assert.equal(tm.getActiveTab()?.agent.id, 'antigravity');
});

test('Agent Synchronization: Two-way sync between CLI Tab and Sidebar selectedAgent', () => {
  let selectedAgent = MOCK_AGENTS[0]; // bottom-left agent
  const tm = createTerminalManager(selectedAgent, 'D:/Workspace/RepoA');

  // Simulate Sync 1: Terminal Tab switched by user clicking OpenCode tab
  const opencodeTab = tm.openTab(MOCK_AGENTS[2], 'D:/Workspace/RepoA');
  if (tm.getActiveTab()?.agent.id !== selectedAgent.id) {
    selectedAgent = tm.getActiveTab().agent;
  }
  assert.equal(selectedAgent.id, 'opencode', 'Bottom-left agent must update when CLI tab changes');

  // Simulate Sync 2: User changes bottom-left agent to Claude Code via "Ganti" button
  selectedAgent = MOCK_AGENTS[1];
  const currentTab = tm.getActiveTab();
  if (!currentTab || currentTab.agent.id !== selectedAgent.id) {
    const existing = tm.getTabs().find((t) => t.agent.id === selectedAgent.id);
    if (existing) {
      tm.setActiveTabId(existing.id);
    } else {
      tm.openTab(selectedAgent, 'D:/Workspace/RepoA');
    }
  }

  assert.equal(tm.getActiveTab()?.agent.id, 'claude', 'Terminal active tab must switch when bottom-left agent changes');
  assert.equal(tm.getTabs().length, 3, 'All 3 tabs (Antigravity, OpenCode, Claude) are maintained in session list');
});
