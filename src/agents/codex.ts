import * as fs from 'fs';
import * as path from 'path';
import type { GatewayConfig } from '../gateways/index.js';
import type { AgentLauncher, ResolvedConfig, SpawnConfig } from './index.js';
import { bifrost } from './shared/bifrost.js';
import {
  DEFAULT_OPENAI_BASE_URL,
  ENV_FALCON_DIR,
  ENV_CODEX_HOME,
  DEFAULT_FALCON_DIR,
} from '../constants.js';
import { getCustomBinPath } from '../config.js';
import {
  deriveProviderKey,
  writeCodexModelCatalog,
  upsertSection,
  removeSection,
} from './codex-utils.js';

export class CodexLauncher implements AgentLauncher {
  name = 'Codex';
  slug = 'codex';
  binaryName = 'codex';
  installCommand = 'npm install -g @openai/codex';

  async resolveConfig(
    gatewayConfig: GatewayConfig,
    gatewaySlug: string,
    apiKey: string,
    model: string,
  ): Promise<ResolvedConfig> {
    const env = { ...gatewayConfig.env };
    let baseUrl = gatewayConfig.baseUrl;
    let cleanup: (() => void) | undefined;

    if (gatewaySlug === 'anthropic') {
      const bifrostInstance = await bifrost.startBifrost('anthropic', apiKey);
      baseUrl = `http://localhost:${bifrostInstance.port}/openai`;
      env['OPENAI_BASE_URL'] = baseUrl;
      env['OPENAI_API_KEY'] = apiKey;
      cleanup = bifrostInstance.cleanup;
    }

    const codexDir = this.getCodexDir();
    env[ENV_CODEX_HOME] = codexDir;

    if (model) {
      try {
        ensureCodexConfig(codexDir, model, baseUrl, env['OPENAI_BASE_URL']);
      } catch (err) {
        console.error(
          `Warning: Failed to configure Codex: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return {
      env,
      baseUrl,
      cleanup,
    };
  }

  buildSpawnConfig(
    resolvedConfig: ResolvedConfig,
    model: string,
    extraArgs: string[],
  ): SpawnConfig {
    const codexDir = this.getCodexDir();
    const catalogPath = path.join(codexDir, 'model.json');

    const args: string[] = ['--profile', 'falcon'];
    if (model) {
      args.push('-c', `model_catalog_json=${catalogPath}`);
      args.push('-m', model);
    }
    args.push(...extraArgs);

    const customPath = getCustomBinPath(this.slug);

    return {
      command: customPath || this.binaryName,
      args,
      env: resolvedConfig.env,
      cleanup: resolvedConfig.cleanup,
    };
  }

  private getCodexDir(): string {
    const falconDir = process.env[ENV_FALCON_DIR] || DEFAULT_FALCON_DIR;
    return process.env[ENV_CODEX_HOME] || path.join(falconDir, this.slug);
  }
}

function ensureCodexConfig(
  codexDir: string,
  modelName: string,
  resolvedBaseUrl?: string,
  envBaseUrl?: string,
): string {
  if (!fs.existsSync(codexDir)) {
    fs.mkdirSync(codexDir, { recursive: true, mode: 0o700 });
  }

  const configPath = path.join(codexDir, 'config.toml');
  const catalogPath = path.join(codexDir, 'model.json');

  writeCodexModelCatalog(catalogPath, modelName);

  let baseUrl =
    resolvedBaseUrl || envBaseUrl || process.env['OPENAI_BASE_URL'] || DEFAULT_OPENAI_BASE_URL;
  if (!baseUrl.endsWith('/')) {
    baseUrl += '/';
  }

  let text = '';
  if (fs.existsSync(configPath)) {
    try {
      text = fs.readFileSync(configPath, 'utf8');
    } catch (_e) {
      // Ignore reading error
    }
  }

  const profileName = 'falcon';
  const providerKey = deriveProviderKey(resolvedBaseUrl);

  const profileLines = [
    `model = "${modelName}"`,
    `model_provider = "${providerKey}"`,
    `forced_login_method = "api"`,
    `model_catalog_json = "${catalogPath}"`,
  ];

  const providerLines = [
    `name = "${providerKey}"`,
    `base_url = "${baseUrl}"`,
    `wire_api = "responses"`,
  ];

  // Remove legacy profile settings/table if present in config.toml
  text = removeSection(text, `[profiles.${profileName}]`);

  // Also remove profile = "falcon" line if present
  text = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*profile\s*=\s*['"]falcon['"]/.test(line))
    .join('\n');

  text = upsertSection(text, `[model_providers.${providerKey}]`, providerLines);

  // Privacy mode: disable analytics and feedback telemetry by default
  text = upsertSection(text, `[analytics]`, [`enabled = false`]);
  text = upsertSection(text, `[feedback]`, [`enabled = false`]);

  fs.writeFileSync(configPath, text, 'utf8');

  // Write modern profile configuration file
  const profileConfigPath = path.join(codexDir, `${profileName}.config.toml`);
  fs.writeFileSync(profileConfigPath, profileLines.join('\n') + '\n', 'utf8');

  return catalogPath;
}
