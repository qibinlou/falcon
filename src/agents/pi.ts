import * as fs from 'fs';
import * as path from 'path';
import { getCustomBinPath } from '../config.js';
import { DEFAULT_FALCON_DIR, ENV_FALCON_DIR, ENV_PI_CONFIG_DIR } from '../constants.js';
import type { GatewayConfig } from '../gateways/index.js';
import type { AgentLauncher, ResolvedConfig, SpawnConfig } from './index.js';

/**
 * Maps a Falcon gateway slug to the pi provider API type.
 * Pi supports: openai-completions, openai-responses, anthropic-messages,
 * google-generative-ai (see pi docs/models.md).
 */
function getPiApiType(gatewaySlug: string): string {
  switch (gatewaySlug) {
    case 'anthropic':
      return 'anthropic-messages';
    default:
      // openrouter, openai, cloudflare, kimi, openai-compatible all speak
      // the OpenAI Chat Completions protocol
      return 'openai-completions';
  }
}

export class PiLauncher implements AgentLauncher {
  name = 'Pi';
  slug = 'pi';
  binaryName = 'pi';

  get installCommand(): string {
    return 'npm install -g --ignore-scripts @earendil-works/pi-coding-agent';
  }

  async resolveConfig(
    gatewayConfig: GatewayConfig,
    gatewaySlug: string,
    apiKey: string,
    model: string,
  ): Promise<ResolvedConfig> {
    const env: Record<string, string> = { ...gatewayConfig.env };
    env['FALCON_GATEWAY_SLUG'] = gatewaySlug;

    // Disable update checks and install/update telemetry for privacy
    env['PI_SKIP_VERSION_CHECK'] = '1';
    env['PI_TELEMETRY'] = '0';

    const falconDir = process.env[ENV_FALCON_DIR] || DEFAULT_FALCON_DIR;
    const configDir = process.env[ENV_PI_CONFIG_DIR] || path.join(falconDir, this.slug);
    env[ENV_PI_CONFIG_DIR] = configDir;

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    if (model) {
      const modelsPath = path.join(configDir, 'models.json');

      // Preserve any existing custom providers in models.json
      let existing: { providers?: Record<string, unknown> } = {};
      try {
        if (fs.existsSync(modelsPath)) {
          existing = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
        }
      } catch (_) {
        existing = {};
      }

      // The API key is referenced via environment interpolation so the raw key
      // never gets persisted to disk. Falcon injects FALCON_PI_API_KEY into the
      // spawned process environment.
      env['FALCON_PI_API_KEY'] = apiKey;

      const providerConfig: Record<string, unknown> = {
        baseUrl: gatewayConfig.baseUrl,
        api: getPiApiType(gatewaySlug),
        apiKey: '$FALCON_PI_API_KEY',
        models: [{ id: model }],
      };

      const configContent = {
        ...existing,
        providers: {
          ...(existing.providers ?? {}),
          falcon: providerConfig,
        },
      };

      try {
        fs.writeFileSync(modelsPath, JSON.stringify(configContent, null, 2), 'utf8');
      } catch (err) {
        console.error(
          `Warning: Failed to write models.json: ${err instanceof Error ? err.message : err}`,
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

    if (prompt !== undefined) {
      // pi uses -p/--print for non-interactive mode; the prompt itself is a
      // positional message argument
      args.push('-p', prompt);
    }

    if (model) {
      args.push('--model', model);
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
