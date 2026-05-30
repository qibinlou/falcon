import * as fs from 'fs';
import * as path from 'path';
import type { GatewayConfig } from '../gateways/index.js';
import type { AgentLauncher, ResolvedConfig, SpawnConfig } from './index.js';
import { ENV_FALCON_DIR, DEFAULT_FALCON_DIR, ENV_OPENCODE_CONFIG_DIR } from '../constants.js';
import { getCustomBinPath } from '../config.js';

/**
 * Maps a Falcon gateway slug to the corresponding OpenCode native provider ID.
 * OpenCode has built-in support for openrouter, openai, and anthropic.
 * For custom/cloudflare gateways we fall back to a custom openai-compatible provider.
 */
function getOpencodeProviderSlug(gatewaySlug: string): string {
  switch (gatewaySlug) {
    case 'openrouter':
      return 'openrouter';
    case 'openai':
      return 'openai';
    case 'anthropic':
      return 'anthropic';
    default:
      return 'openai'; // fallback: treat as openai-compatible
  }
}

export class OpencodeLauncher implements AgentLauncher {
  name = 'OpenCode';
  slug = 'opencode';
  binaryName = 'opencode';

  get installCommand(): string {
    return 'npm install -g opencode-ai';
  }

  async resolveConfig(
    gatewayConfig: GatewayConfig,
    gatewaySlug: string,
    apiKey: string,
    model: string,
  ): Promise<ResolvedConfig> {
    const env: Record<string, string> = { ...gatewayConfig.env };
    env['FALCON_GATEWAY_SLUG'] = gatewaySlug;

    const falconDir = process.env[ENV_FALCON_DIR] || DEFAULT_FALCON_DIR;
    const configDir = process.env[ENV_OPENCODE_CONFIG_DIR] || path.join(falconDir, this.slug);
    env[ENV_OPENCODE_CONFIG_DIR] = configDir;
    const configPath = path.join(configDir, 'opencode.json');
    // OPENCODE_CONFIG points opencode at our managed config file
    env['OPENCODE_CONFIG'] = configPath;

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    if (model) {
      // Strip :free or similar suffixes that OpenCode does not understand
      let targetModel = model;
      if (targetModel.includes(':')) {
        targetModel = targetModel.split(':')[0] || targetModel;
      }

      const providerSlug = getOpencodeProviderSlug(gatewaySlug);

      // Build the opencode.json config with the model registered under its provider.
      // For built-in providers (openrouter, openai, anthropic) we only need to declare
      // the model entry — credentials are auto-detected from environment variables.
      // For cloudflare or other custom gateways we also embed a baseURL so opencode
      // can reach the right endpoint.
      const providerConfig: Record<string, unknown> = {
        models: {
          [targetModel]: {},
        },
      };

      // For non-native providers, add custom openai-compatible config with the base URL
      if (gatewaySlug === 'cloudflare' && gatewayConfig.baseUrl) {
        providerConfig.npm = '@ai-sdk/openai-compatible';
        providerConfig.name = 'Cloudflare AI Gateway';
        providerConfig.options = {
          baseURL: gatewayConfig.baseUrl,
          apiKey,
        };
      }

      const configContent = {
        $schema: 'https://opencode.ai/config.json',
        provider: {
          [providerSlug]: providerConfig,
        },
        // Set the default model so opencode uses it when --model is passed
        model: targetModel.startsWith(`${providerSlug}/`) ? targetModel : `${providerSlug}/${targetModel}`,
      };

      try {
        fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2), 'utf8');
      } catch (err) {
        console.error(
          `Warning: Failed to write opencode.json: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return {
      env,
    };
  }

  buildSpawnConfig(
    resolvedConfig: ResolvedConfig,
    model: string,
    extraArgs: string[],
  ): SpawnConfig {
    const args: string[] = [];
    let prompt: string | undefined;
    const filteredExtraArgs: string[] = [];

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

    if (prompt) {
      args.push('run', prompt);
    }

    if (model) {
      // Strip :free or similar suffixes
      let targetModel = model;
      if (targetModel.includes(':')) {
        targetModel = targetModel.split(':')[0] || targetModel;
      }

      const gatewaySlug = resolvedConfig.env['FALCON_GATEWAY_SLUG'];
      const providerSlug = gatewaySlug ? getOpencodeProviderSlug(gatewaySlug) : 'openrouter';

      // OpenCode model format is "{providerSlug}/{modelId}"
      const fullModelId = targetModel.startsWith(`${providerSlug}/`) ? targetModel : `${providerSlug}/${targetModel}`;
      args.push('--model', fullModelId);
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
