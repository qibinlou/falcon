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
import {
  deriveProviderKey,
  writeCodexModelCatalog,
  upsertSection,
  upsertTopLevelKey,
} from './codex-utils.js';

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
  name = 'Codex Desktop App';
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
        await ensureCodexAppConfig(codexDir, model, baseUrl, env['OPENAI_BASE_URL']);
      } catch (err) {
        console.error(
          `Warning: Failed to configure Codex App: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return { env, baseUrl, cleanup };
  }

  buildSpawnConfig(
    resolvedConfig: ResolvedConfig,
    _model: string,
    extraArgs: string[],
  ): SpawnConfig {
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
async function ensureCodexAppConfig(
  codexDir: string,
  modelName: string,
  resolvedBaseUrl?: string,
  envBaseUrl?: string,
): Promise<void> {
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
