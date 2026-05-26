import * as fs from 'fs';
import * as path from 'path';
import type { GatewayConfig } from '../gateways/index.js';
import type { AgentLauncher, ResolvedConfig, SpawnConfig } from './index.js';
import { bifrost } from './shared/bifrost.js';
import {
  DEFAULT_ANTHROPIC_BASE_URL,
  ENV_FALCON_DIR,
  ENV_CLAUDE_CONFIG_DIR,
  DEFAULT_FALCON_DIR,
} from '../constants.js';
import { getCustomBinPath } from '../config.js';

export class ClaudeLauncher implements AgentLauncher {
  name = 'Claude Code';
  slug = 'claude';
  binaryName = 'claude';

  get installCommand(): string {
    return process.platform === 'win32'
      ? 'curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd'
      : 'curl -fsSL https://claude.ai/install.sh | bash';
  }

  async resolveConfig(
    gatewayConfig: GatewayConfig,
    gatewaySlug: string,
    apiKey: string,
    model: string,
  ): Promise<ResolvedConfig> {
    const env: Record<string, string> = { ...gatewayConfig.env };
    let cleanup: (() => void) | undefined;

    if (gatewaySlug === 'openai') {
      const bifrostInstance = await bifrost.startBifrost('openai', apiKey);
      env['ANTHROPIC_BASE_URL'] = `http://localhost:${bifrostInstance.port}/anthropic`;
      env['ANTHROPIC_API_KEY'] = apiKey;
      cleanup = bifrostInstance.cleanup;
    }

    const baseUrl = env['ANTHROPIC_BASE_URL'];
    const isOfficialAnthropic =
      baseUrl === DEFAULT_ANTHROPIC_BASE_URL ||
      baseUrl === `${DEFAULT_ANTHROPIC_BASE_URL}/` ||
      baseUrl === `${DEFAULT_ANTHROPIC_BASE_URL}/v1` ||
      baseUrl === `${DEFAULT_ANTHROPIC_BASE_URL}/v1/`;

    if (isOfficialAnthropic) {
      delete env['ANTHROPIC_AUTH_TOKEN'];
    } else {
      env['ANTHROPIC_AUTH_TOKEN'] = env['ANTHROPIC_API_KEY'];
      env['ANTHROPIC_API_KEY'] = '';
    }

    env['CLAUDE_CODE_ATTRIBUTION_HEADER'] = '0';

    // Full privacy mode for Claude Code.
    // Disables telemetry, nonessential traffic, error reporting, and feedback surveys
    env['DISABLE_TELEMETRY'] = '1';
    env['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'] = '1';
    env['DISABLE_ERROR_REPORTING'] = '1';
    env['CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY'] = '1';

    if (model) {
      env['ANTHROPIC_DEFAULT_OPUS_MODEL'] = model;
      env['ANTHROPIC_DEFAULT_SONNET_MODEL'] = model;
      env['ANTHROPIC_DEFAULT_HAIKU_MODEL'] = model;
      env['CLAUDE_CODE_SUBAGENT_MODEL'] = model;
    }

    const falconDir = process.env[ENV_FALCON_DIR] || DEFAULT_FALCON_DIR;
    const claudeDir = process.env[ENV_CLAUDE_CONFIG_DIR] || path.join(falconDir, this.slug);
    env[ENV_CLAUDE_CONFIG_DIR] = claudeDir;

    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true, mode: 0o700 });
    }

    return {
      env,
      cleanup,
    };
  }

  buildSpawnConfig(
    resolvedConfig: ResolvedConfig,
    model: string,
    extraArgs: string[],
  ): SpawnConfig {
    const args: string[] = [];
    if (model) {
      args.push('--model', model);
    }
    // Always skip permissions in sandbox mode
    args.push('--dangerously-skip-permissions');
    args.push(...extraArgs);

    const customPath = getCustomBinPath(this.slug);

    return {
      command: customPath || this.binaryName,
      args,
      env: resolvedConfig.env,
      cleanup: resolvedConfig.cleanup,
    };
  }
}
