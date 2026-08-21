import * as fs from 'fs';
import * as path from 'path';
import { getCustomBinPath } from '../config.js';
import {
  DEFAULT_FALCON_DIR,
  DEFAULT_OPENROUTER_BASE_URL,
  ENV_FALCON_DIR,
  ENV_HERMES_HOME,
} from '../constants.js';
import type { GatewayConfig } from '../gateways/index.js';
import type { AgentLauncher, ResolvedConfig, SpawnConfig } from './index.js';

function getHermesProvider(gatewaySlug: string): string {
  switch (gatewaySlug) {
    case 'openrouter':
      return 'openrouter';
    case 'anthropic':
      return 'anthropic';
    case 'openai':
      return 'openai-api';
    default:
      return 'custom';
  }
}

export class HermesLauncher implements AgentLauncher {
  name = 'Hermes';
  slug = 'hermes';
  binaryName = 'hermes';

  get installCommand(): string {
    return 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash';
  }

  async resolveConfig(
    gatewayConfig: GatewayConfig,
    gatewaySlug: string,
    apiKey: string,
    _model: string,
  ): Promise<ResolvedConfig> {
    const env: Record<string, string> = { ...gatewayConfig.env };
    env['FALCON_GATEWAY_SLUG'] = gatewaySlug;
    env['FALCON_HERMES_PROVIDER'] = getHermesProvider(gatewaySlug);

    const falconDir = process.env[ENV_FALCON_DIR] || DEFAULT_FALCON_DIR;
    const hermesHome = process.env[ENV_HERMES_HOME] || path.join(falconDir, this.slug);
    env[ENV_HERMES_HOME] = hermesHome;

    if (!fs.existsSync(hermesHome)) {
      fs.mkdirSync(hermesHome, { recursive: true, mode: 0o700 });
    }

    switch (gatewaySlug) {
      case 'openrouter':
        env['OPENROUTER_API_KEY'] = apiKey;
        if (gatewayConfig.baseUrl && gatewayConfig.baseUrl !== DEFAULT_OPENROUTER_BASE_URL) {
          env['OPENROUTER_BASE_URL'] = gatewayConfig.baseUrl;
        }
        break;
      case 'anthropic':
        env['ANTHROPIC_API_KEY'] = apiKey;
        break;
      case 'openai':
        env['OPENAI_API_KEY'] = apiKey;
        if (gatewayConfig.baseUrl) {
          env['OPENAI_BASE_URL'] = gatewayConfig.baseUrl;
        }
        break;
      default:
        env['OPENAI_API_KEY'] = apiKey;
        if (gatewayConfig.baseUrl) {
          env['OPENAI_BASE_URL'] = gatewayConfig.baseUrl;
        }
        break;
    }

    return { env };
  }

  buildSpawnConfig(
    resolvedConfig: ResolvedConfig,
    model: string,
    extraArgs: string[],
  ): SpawnConfig {
    const args = ['chat'];
    const filteredExtraArgs: string[] = [];
    let prompt: string | undefined;

    for (let i = 0; i < extraArgs.length; i++) {
      if (extraArgs[i] === '-p' || extraArgs[i] === '--prompt') {
        if (i + 1 < extraArgs.length) {
          prompt = extraArgs[i + 1];
          i++;
        }
      } else {
        filteredExtraArgs.push(extraArgs[i]);
      }
    }

    const provider = resolvedConfig.env['FALCON_HERMES_PROVIDER'];
    if (provider) {
      args.push('--provider', provider);
    }
    if (model) {
      args.push('--model', model);
    }
    if (prompt !== undefined) {
      args.push('-q', prompt);
    }
    args.push(...filteredExtraArgs);

    const customPath = getCustomBinPath(this.slug);
    return {
      command: customPath || this.binaryName,
      args,
      env: resolvedConfig.env,
      cleanup: resolvedConfig.cleanup,
    };
  }
}
