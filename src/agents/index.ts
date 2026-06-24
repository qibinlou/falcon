import type { ChildProcess } from 'child_process';
import type { GatewayConfig } from '../gateways/index.js';

export interface ResolvedConfig {
  env: Record<string, string>;
  baseUrl?: string;
  cleanup?: () => void;
  gatewaySlug?: string;
}

export interface SpawnConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  cleanup?: () => void;
  afterSpawn?: (proc: ChildProcess) => void | Promise<void>;
  detached?: boolean;
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
export { CodexAppLauncher as CodexAppAgent } from './codex-app.js';
export { OpencodeLauncher as OpencodeAgent } from './opencode.js';

import { ClaudeLauncher } from './claude.js';
import { CodexLauncher } from './codex.js';
import { CodexAppLauncher } from './codex-app.js';
import { OpencodeLauncher } from './opencode.js';

export const ALL_AGENTS: AgentLauncher[] = [
  new CodexLauncher(),
  new CodexAppLauncher(),
  new ClaudeLauncher(),
  new OpencodeLauncher(),
];

export function findAgent(name: string): AgentLauncher | undefined {
  return ALL_AGENTS.find(
    (a) => a.slug === name.toLowerCase() || a.name.toLowerCase() === name.toLowerCase(),
  );
}
