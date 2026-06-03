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

function getContextWindow(modelName: string): number {
  const name = modelName.toLowerCase();
  if (name.includes('claude-3')) {
    return 200000;
  }
  if (name.includes('gpt-4o') || name.includes('gpt-4-turbo') || name.includes('gpt-4')) {
    return 128000;
  }
  if (name.includes('gpt-3.5')) {
    return 16385;
  }
  if (name.includes('gemini-1.5') || name.includes('gemini-2.0') || name.includes('gemini-2.5')) {
    return 1000000;
  }
  return 128000; // fallback default
}

function getModalities(modelName: string): string[] {
  const name = modelName.toLowerCase();
  const hasVision =
    name.includes('vision') ||
    name.includes('gpt-4o') ||
    name.includes('claude-3') ||
    name.includes('gemini');
  const modalities = ['text'];
  if (hasVision) {
    modalities.push('image');
  }
  return modalities;
}

function writeCodexModelCatalog(catalogPath: string, modelName: string) {
  let catalog: { models: { slug: string; [key: string]: unknown }[] } = { models: [] };
  if (fs.existsSync(catalogPath)) {
    try {
      const data = fs.readFileSync(catalogPath, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.models)) {
        catalog = parsed;
      }
    } catch (_e) {
      // Ignore reading error and overwrite/create new
    }
  }

  const contextWindow = getContextWindow(modelName);
  const modalities = getModalities(modelName);
  const truncationMode = modelName.includes('/') ? 'tokens' : 'bytes';

  const entry = {
    slug: modelName,
    display_name: modelName,
    context_window: contextWindow,
    shell_type: 'default',
    visibility: 'list',
    supported_in_api: true,
    priority: 0,
    truncation_policy: { mode: truncationMode, limit: 10000 },
    input_modalities: modalities,
    base_instructions: '',
    support_verbosity: true,
    default_verbosity: 'low',
    supports_parallel_tool_calls: false,
    supports_reasoning_summaries: false,
    supported_reasoning_levels: [],
    experimental_supported_tools: [],
  };

  const existingIndex = catalog.models.findIndex((m) => m.slug === modelName);
  if (existingIndex !== -1) {
    catalog.models[existingIndex] = entry;
  } else {
    catalog.models.push(entry);
  }

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
}

function upsertSection(text: string, header: string, lines: string[]): string {
  const fileLines = text.split(/\r?\n/);
  const targetHeader = header.trim();
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < fileLines.length; i++) {
    const trimmed = fileLines[i].trim();
    if (trimmed === targetHeader) {
      startIndex = i;
      for (let j = i + 1; j < fileLines.length; j++) {
        const nextTrimmed = fileLines[j].trim();
        if (nextTrimmed.startsWith('[') && nextTrimmed.endsWith(']')) {
          endIndex = j;
          break;
        }
      }
      if (endIndex === -1) {
        endIndex = fileLines.length;
      }
      break;
    }
  }

  const blockLines = [targetHeader, ...lines, ''];
  if (startIndex !== -1) {
    fileLines.splice(startIndex, endIndex - startIndex, ...blockLines);
  } else {
    if (fileLines.length > 0 && fileLines[fileLines.length - 1].trim() !== '') {
      fileLines.push('');
    }
    fileLines.push(...blockLines);
  }
  return fileLines.join('\n');
}

function removeSection(text: string, header: string): string {
  const fileLines = text.split(/\r?\n/);
  const targetHeader = header.trim();
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < fileLines.length; i++) {
    const trimmed = fileLines[i].trim();
    if (trimmed === targetHeader) {
      startIndex = i;
      for (let j = i + 1; j < fileLines.length; j++) {
        const nextTrimmed = fileLines[j].trim();
        if (nextTrimmed.startsWith('[') && nextTrimmed.endsWith(']')) {
          endIndex = j;
          break;
        }
      }
      if (endIndex === -1) {
        endIndex = fileLines.length;
      }
      break;
    }
  }

  if (startIndex !== -1) {
    fileLines.splice(startIndex, endIndex - startIndex);
  }
  return fileLines.join('\n');
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
  let providerKey = 'falcon';

  if (resolvedBaseUrl) {
    try {
      const urlStr = resolvedBaseUrl.includes('://')
        ? resolvedBaseUrl
        : `http://${resolvedBaseUrl}`;
      const sanitizedUrlStr = urlStr.replace('<BIFROST_PORT>', '9999');
      const parsedUrl = new URL(sanitizedUrlStr);
      if (parsedUrl.hostname) {
        providerKey = parsedUrl.hostname.replaceAll('.', '-');
      }
    } catch (_e) {
      // Keep defaults
    }
  }

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
