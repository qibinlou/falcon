import type { GatewayConfig } from '../gateways/index.js';

export interface ResolvedConfig {
  env: Record<string, string>;
  baseUrl?: string;
  cleanup?: () => void;
}

export interface SpawnConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  cleanup?: () => void;
}

export interface AgentLauncher {
  name: string;
  slug: string;
  binaryName: string;
  installCommand: string;
  resolveConfig(
    gatewayConfig: GatewayConfig,
    gatewaySlug: string,
    apiKey: string,
    model: string,
  ): Promise<ResolvedConfig>;
  buildSpawnConfig(resolvedConfig: ResolvedConfig, model: string, extraArgs: string[]): SpawnConfig;
}

export { ClaudeLauncher as ClaudeAgent } from './claude.js';
export { CodexLauncher as CodexAgent } from './codex.js';
export { OpencodeLauncher as OpencodeAgent } from './opencode.js';

import { ClaudeLauncher } from './claude.js';
import { CodexLauncher } from './codex.js';
import { OpencodeLauncher } from './opencode.js';

export const ALL_AGENTS: AgentLauncher[] = [
  new CodexLauncher(),
  new ClaudeLauncher(),
  new OpencodeLauncher(),
];

export function findAgent(name: string): AgentLauncher | undefined {
  return ALL_AGENTS.find(
    (a) => a.slug === name.toLowerCase() || a.name.toLowerCase() === name.toLowerCase(),
  );
}
