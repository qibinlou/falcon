import * as fs from 'fs';
import * as path from 'path';
import child_process from 'child_process';
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
    const customPath = getCustomBinPath(this.slug);
    const binaryPath = customPath || this.binaryName;

    // Enforce Codex CLI version >= 0.134.0
    const versionStr = getCodexVersion(binaryPath);
    if (versionStr && !isModernCodex(versionStr)) {
      throw new Error(
        `Codex CLI version is ${versionStr}. Falcon requires Codex CLI >= 0.134.0. Please run 'npm install -g @openai/codex' or 'codex update' to upgrade.`,
      );
    }

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
        await ensureCodexConfig(codexDir, model, baseUrl, env['OPENAI_BASE_URL']);
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

    const filteredExtraArgs: string[] = [];
    let prompt: string | undefined;

    for (let i = 0; i < extraArgs.length; i++) {
      const arg = extraArgs[i];
      if (arg === '-m' || arg === '--model') {
        if (i + 1 < extraArgs.length) {
          i++; // skip model name value
        }
      } else if (arg === '-p' || arg === '--prompt') {
        if (i + 1 < extraArgs.length) {
          prompt = extraArgs[i + 1];
          i++;
        }
      } else {
        filteredExtraArgs.push(arg);
      }
    }

    const args: string[] = [];
    if (prompt) {
      args.push('exec');
    }
    args.push('--profile', 'falcon');

    if (model) {
      args.push('-c', `model_catalog_json=${catalogPath}`);
      args.push('-m', model);
    }

    args.push(...filteredExtraArgs);

    if (prompt) {
      args.push(prompt);
    }

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

export function getCodexVersion(binaryPath: string): string | null {
  try {
    const proc = child_process.spawnSync(binaryPath, ['--version'], {
      encoding: 'utf8',
      timeout: 1000,
    });
    if (proc.status === 0) {
      const match = proc.stdout.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    }
  } catch (_e) {
    // Ignore and fallback
  }
  return null;
}

export function isModernCodex(versionStr: string | null): boolean {
  if (!versionStr) {
    return true; // fallback to modern
  }
  const match = versionStr.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return true;
  }
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  const patch = parseInt(match[3], 10);
  if (major > 0) return true;
  if (minor > 134) return true;
  if (minor === 134 && patch >= 0) return true;
  return false;
}

async function ensureCodexConfig(
  codexDir: string,
  modelName: string,
  resolvedBaseUrl?: string,
  envBaseUrl?: string,
): Promise<string> {
  if (!fs.existsSync(codexDir)) {
    fs.mkdirSync(codexDir, { recursive: true, mode: 0o700 });
  }

  const configPath = path.join(codexDir, 'config.toml');
  const catalogPath = path.join(codexDir, 'model.json');

  await writeCodexModelCatalog(catalogPath, modelName);

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
    `env_key = "OPENAI_API_KEY"`,
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
