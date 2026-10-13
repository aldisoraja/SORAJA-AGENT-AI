import React from 'react';
import type { TrajectoryStep, CodeEditChunk } from './database';

export interface ModelItem {
  id: string;
  name: string;
  badge?: string;
  desc: string;
  speed: string;
  contextWindow?: string;
  /** false = model terbukti tidak menerima gambar (dari metadata CLI). undefined = tidak diketahui. */
  supportsImages?: boolean | null;
}

export interface AgentProvider {
  id: string;
  name: string;
  vendor: string;
  executable?: string;
  iconName?: string;
  icon?: React.ReactNode;
  accent: string;
  badgeColor: string;
  description?: string;
  isInstalled?: boolean;
  binaryPath?: string | null;
  defaultModelId?: string;
  models: ModelItem[];
}

export interface IntelligentAgentResult {
  content: string;
  reasoning: string;
  toolCall?: {
    name: string;
    command: string;
    status: 'running' | 'success' | 'blocked';
  };
  trajectory?: TrajectoryStep[];
  codeEdits?: CodeEditChunk[];
}
