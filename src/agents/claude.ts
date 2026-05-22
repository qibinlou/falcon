import type { GatewayConfig } from '../gateways/index.js';
import type { AgentLauncher, ResolvedConfig, SpawnConfig } from './index.js';
import { startBifrost } from './shared/bifrost.js';
import { DEFAULT_ANTHROPIC_BASE_URL } from '../constants.js';

export class ClaudeLauncher implements AgentLauncher {
  name = 'Claude Code';
  slug = 'claude';

  async resolveConfig(
    gatewayConfig: GatewayConfig,
    gatewaySlug: string,
    apiKey: string,
    model: string,
    options?: { dryRun?: boolean },
  ): Promise<ResolvedConfig> {
    const env: Record<string, string> = { ...gatewayConfig.env };
    let cleanup: (() => void) | undefined;

    if (gatewaySlug === 'openai') {
      if (options?.dryRun) {
        env['ANTHROPIC_BASE_URL'] = 'http://localhost:<BIFROST_PORT>/anthropic';
        env['ANTHROPIC_API_KEY'] = apiKey;
      } else {
        const bifrost = await startBifrost('openai', apiKey);
        env['ANTHROPIC_BASE_URL'] = `http://localhost:${bifrost.port}/anthropic`;
        env['ANTHROPIC_API_KEY'] = apiKey;
        cleanup = bifrost.cleanup;
      }
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

    return {
      command: 'claude',
      args,
      env: resolvedConfig.env,
      cleanup: resolvedConfig.cleanup,
    };
  }
}
