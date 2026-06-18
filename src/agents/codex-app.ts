import * as fs from 'fs';
import * as path from 'path';
import type { GatewayConfig } from '../gateways/index.js';
import type { AgentLauncher, ResolvedConfig, SpawnConfig } from './index.js';
import { bifrost } from './shared/bifrost.js';
import { DEFAULT_OPENAI_BASE_URL, ENV_FALCON_DIR, ENV_CODEX_HOME, DEFAULT_FALCON_DIR } from '../constants.js';

const DEFAULT_CODEX_DESKTOP_PATH = '/Applications/Codex.app/Contents/MacOS/Codex';

/**
 * Launches the Codex **desktop app** (the Electron build) configured against a
 * falcon gateway, in its own data directory so it runs alongside the user's
 * primary (subscription) Codex window.
 *
 * This is intentionally separate from {@link import('./codex.js').CodexLauncher},
 * which targets the `codex` CLI. The desktop Electron binary ignores Codex's own
 * `-c`/`-m`/`--profile` flags — it only honours the Chromium `--user-data-dir`
 * flag — so all configuration is delivered through files + env in CODEX_HOME:
 *   - `config.toml`     — provider routing + the picked model (top-level keys).
 *   - `model.json`      — the model catalog the desktop UI lists.
 *   - `auth.json`       — API-key auth so it skips the ChatGPT login prompt.
 *   - `OPENAI_BASE_URL` / `OPENAI_API_KEY` env — the live gateway endpoint.
 */
export class CodexAppLauncher implements AgentLauncher {
  name = 'Codex App';
  slug = 'codex-app';
  // The desktop app ships with the `codex` CLI; use it as the install probe.
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

    const codexDir = this.getCodexAppDir();
    env[ENV_CODEX_HOME] = codexDir;

    // Persist API-key auth so the desktop app authenticates against the gateway
    // out of the box instead of falling back to the ChatGPT subscription login.
    const apiAuthKey = env['OPENAI_API_KEY'] || apiKey;
    if (apiAuthKey) {
      try {
        ensureCodexAuth(codexDir, apiAuthKey);
      } catch (err) {
        console.error(
          `Warning: Failed to write Codex auth: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (model) {
      try {
        ensureCodexAppConfig(codexDir, model, baseUrl, env['OPENAI_BASE_URL']);
      } catch (err) {
        console.error(
          `Warning: Failed to configure Codex App: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return { env, baseUrl, cleanup };
  }

  buildSpawnConfig(resolvedConfig: ResolvedConfig, _model: string, extraArgs: string[]): SpawnConfig {
    const codexDir = this.getCodexAppDir();
    const electronUserDataDir = path.join(codexDir, 'electron-user-data');
    const desktopBinary = process.env['CODEX_DESKTOP_PATH'] || DEFAULT_CODEX_DESKTOP_PATH;

    // A dedicated `--user-data-dir` defeats Electron's single-instance lock so a
    // new window opens even while the primary Codex app is running.
    return {
      command: desktopBinary,
      args: [`--user-data-dir=${electronUserDataDir}`, ...extraArgs],
      env: {
        ...resolvedConfig.env,
        CODEX_ELECTRON_USER_DATA_PATH: electronUserDataDir,
      },
      cleanup: resolvedConfig.cleanup,
    };
  }

  private getCodexAppDir(): string {
    const falconDir = process.env[ENV_FALCON_DIR] || DEFAULT_FALCON_DIR;
    return path.join(falconDir, this.slug);
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
  return 128000;
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

function writeCodexModelCatalog(catalogPath: string, modelName: string): void {
  let catalog: { models: { slug: string; [key: string]: unknown }[] } = { models: [] };
  if (fs.existsSync(catalogPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      if (parsed && Array.isArray(parsed.models)) {
        catalog = parsed;
      }
    } catch (_e) {
      // Ignore and overwrite with a fresh catalog
    }
  }

  const entry = {
    slug: modelName,
    display_name: modelName,
    context_window: getContextWindow(modelName),
    shell_type: 'default',
    visibility: 'list',
    supported_in_api: true,
    priority: 0,
    truncation_policy: { mode: modelName.includes('/') ? 'tokens' : 'bytes', limit: 10000 },
    input_modalities: getModalities(modelName),
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

/** Derives the `[model_providers.<key>]` name from a base URL's hostname. */
function deriveProviderKey(resolvedBaseUrl?: string): string {
  if (!resolvedBaseUrl) {
    return 'falcon';
  }
  try {
    const urlStr = resolvedBaseUrl.includes('://') ? resolvedBaseUrl : `http://${resolvedBaseUrl}`;
    const parsedUrl = new URL(urlStr.replace('<BIFROST_PORT>', '9999'));
    if (parsedUrl.hostname) {
      return parsedUrl.hostname.replaceAll('.', '-');
    }
  } catch (_e) {
    // Fall back to the default
  }
  return 'falcon';
}

/** Inserts or replaces a `[header]` section (until the next section) in TOML text. */
function upsertSection(text: string, header: string, lines: string[]): string {
  const fileLines = text.split(/\r?\n/);
  const targetHeader = header.trim();
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < fileLines.length; i++) {
    if (fileLines[i].trim() === targetHeader) {
      startIndex = i;
      for (let j = i + 1; j < fileLines.length; j++) {
        const next = fileLines[j].trim();
        if (next.startsWith('[') && next.endsWith(']')) {
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

/** Inserts or replaces a top-level `key = "value"` (before the first section). */
function upsertTopLevelKey(text: string, key: string, value: string): string {
  const lines = text.split(/\r?\n/);
  let firstSection = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('[') && t.endsWith(']')) {
      firstSection = i;
      break;
    }
  }

  const assignment = `${key} = "${value}"`;
  const keyRe = new RegExp(`^\\s*${key}\\s*=`);
  for (let i = 0; i < firstSection; i++) {
    if (keyRe.test(lines[i])) {
      lines[i] = assignment;
      return lines.join('\n');
    }
  }
  lines.splice(firstSection, 0, assignment);
  return lines.join('\n');
}

/**
 * Writes `auth.json` with API-key auth. The matching base URL is supplied
 * separately via the `OPENAI_BASE_URL` env var at launch.
 */
function ensureCodexAuth(codexDir: string, apiKey: string): void {
  if (!fs.existsSync(codexDir)) {
    fs.mkdirSync(codexDir, { recursive: true, mode: 0o700 });
  }
  const authPath = path.join(codexDir, 'auth.json');
  const auth = { auth_mode: 'apikey', OPENAI_API_KEY: apiKey };
  fs.writeFileSync(authPath, JSON.stringify(auth, null, 2), { encoding: 'utf8', mode: 0o600 });
}

/**
 * Configures the desktop app's `CODEX_HOME`. Unlike the CLI (which activates a
 * `[profiles.falcon]` profile via `--profile`), the desktop app can't take a
 * profile flag, so the picked model + provider are written as **top-level**
 * `config.toml` keys, alongside the provider section and the model catalog.
 */
function ensureCodexAppConfig(
  codexDir: string,
  modelName: string,
  resolvedBaseUrl?: string,
  envBaseUrl?: string,
): void {
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
  const providerKey = deriveProviderKey(resolvedBaseUrl);

  let text = '';
  if (fs.existsSync(configPath)) {
    try {
      text = fs.readFileSync(configPath, 'utf8');
    } catch (_e) {
      // Ignore read error and rebuild from what we know
    }
  }

  // Top-level selection the desktop app reads (no profile available to it).
  text = upsertTopLevelKey(text, 'model', modelName);
  text = upsertTopLevelKey(text, 'model_provider', providerKey);
  text = upsertTopLevelKey(text, 'model_catalog_json', catalogPath);

  text = upsertSection(text, `[model_providers.${providerKey}]`, [
    `name = "${providerKey}"`,
    `base_url = "${baseUrl}"`,
    `wire_api = "responses"`,
  ]);

  // Privacy mode: disable analytics and feedback telemetry by default.
  text = upsertSection(text, `[analytics]`, [`enabled = false`]);
  text = upsertSection(text, `[feedback]`, [`enabled = false`]);

  fs.writeFileSync(configPath, text, 'utf8');
}
