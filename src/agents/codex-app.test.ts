import assert from 'node:assert';
import { after, before, describe, test, mock } from 'node:test';
import type { ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { GatewayConfig } from '../gateways/index.js';
import { CodexAppLauncher } from './codex-app.js';
import { bifrost } from './shared/bifrost.js';
import { ENV_CODEX_HOME, ENV_FALCON_DIR } from '../constants.js';
import {
  clearModelMetadataCache,
  setLocalModelMetadataCache,
} from '../gateways/shared/modelEnricher.js';

describe('Codex App (Desktop) Launcher', () => {
  let falconDir: string;
  let codexAppDir: string;
  let originalFalconDir: string | undefined;
  let originalCodexHome: string | undefined;
  let originalChatGptAuthPath: string | undefined;
  const launcher = new CodexAppLauncher();

  before(() => {
    originalFalconDir = process.env[ENV_FALCON_DIR];
    originalCodexHome = process.env[ENV_CODEX_HOME];
    originalChatGptAuthPath = process.env['FALCON_CODEX_APP_CHATGPT_AUTH_PATH'];
    falconDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-app-test-'));
    process.env[ENV_FALCON_DIR] = falconDir;
    // A global CODEX_HOME must NOT redirect the desktop dir — it should always
    // live under FALCON_DIR/codex-app to stay isolated from the user's ~/.codex.
    delete process.env[ENV_CODEX_HOME];
    process.env['FALCON_CODEX_APP_CHATGPT_AUTH_PATH'] = path.join(
      falconDir,
      'missing-primary-auth.json',
    );
    codexAppDir = path.join(falconDir, 'codex-app');
    setLocalModelMetadataCache({
      'deepseek/deepseek-v4': {
        contextLength: 163840,
        modalities: ['text'],
        pricing: { prompt: '$0.27/1M', completion: '$1.10/1M', promptPerM: 0.27 },
      },
      'gpt-4o': {
        contextLength: 128000,
        modalities: ['text', 'image'],
        pricing: { prompt: '$2.50/1M', completion: '$10.00/1M', promptPerM: 2.5 },
      },
    });
  });

  after(() => {
    clearModelMetadataCache();
    if (originalFalconDir !== undefined) {
      process.env[ENV_FALCON_DIR] = originalFalconDir;
    } else {
      delete process.env[ENV_FALCON_DIR];
    }
    if (originalCodexHome !== undefined) {
      process.env[ENV_CODEX_HOME] = originalCodexHome;
    } else {
      delete process.env[ENV_CODEX_HOME];
    }
    if (originalChatGptAuthPath !== undefined) {
      process.env['FALCON_CODEX_APP_CHATGPT_AUTH_PATH'] = originalChatGptAuthPath;
    } else {
      delete process.env['FALCON_CODEX_APP_CHATGPT_AUTH_PATH'];
    }
    if (fs.existsSync(falconDir)) {
      fs.rmSync(falconDir, { recursive: true, force: true });
    }
  });

  test('should have correct details', () => {
    assert.strictEqual(launcher.name, 'Codex Desktop App');
    assert.strictEqual(launcher.slug, 'codex-app');
    assert.strictEqual(
      launcher.binaryName,
      process.env['CHATGPT_DESKTOP_PATH'] ||
        process.env['CODEX_DESKTOP_PATH'] ||
        '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
    );
  });

  test('resolveConfig sets CODEX_HOME under FALCON_DIR/codex-app and passes env through', async () => {
    const config: GatewayConfig = {
      env: {
        OPENAI_API_KEY: 'sk-openai-key',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
      },
      baseUrl: 'https://api.openai.com/v1',
    };

    const resolved = await launcher.resolveConfig(config, 'openai', 'sk-openai-key', 'gpt-4o');

    assert.strictEqual(resolved.env[ENV_CODEX_HOME], codexAppDir);
    assert.strictEqual(resolved.env['OPENAI_BASE_URL'], 'https://api.openai.com/v1');
    assert.strictEqual(resolved.env['OPENAI_API_KEY'], 'sk-openai-key');
    assert.strictEqual(resolved.env['FALCON_CODEX_APP_DEBUG_PORT'], undefined);
  });

  test('resolveConfig writes model.json, top-level config.toml selection, and auth.json', async () => {
    const config: GatewayConfig = {
      env: {
        OPENAI_API_KEY: 'sk-or-fake-key',
        OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
      },
      baseUrl: 'https://openrouter.ai/api/v1',
    };

    await launcher.resolveConfig(config, 'openrouter', 'sk-or-fake-key', 'deepseek/deepseek-v4');

    const configPath = path.join(codexAppDir, 'config.toml');
    const catalogPath = path.join(codexAppDir, 'model.json');
    const authPath = path.join(codexAppDir, 'auth.json');
    const cachePath = path.join(codexAppDir, 'models_cache.json');

    assert.ok(fs.existsSync(configPath), 'config.toml should exist');
    assert.ok(fs.existsSync(catalogPath), 'model.json should exist');
    assert.ok(fs.existsSync(authPath), 'auth.json should exist');
    assert.ok(fs.existsSync(cachePath), 'models_cache.json should exist');

    // The desktop app reads top-level keys (it has no profile to activate).
    const configContent = fs.readFileSync(configPath, 'utf8');
    assert.ok(configContent.includes('model = "deepseek/deepseek-v4"'), 'top-level model');
    assert.ok(configContent.includes('model_provider = "openrouter-ai"'), 'top-level provider');
    assert.ok(configContent.includes(`model_catalog_json = "${catalogPath}"`), 'top-level catalog');
    assert.ok(configContent.includes('[model_providers.openrouter-ai]'), 'provider section');
    assert.ok(configContent.includes('base_url = "https://openrouter.ai/api/v1/"'), 'base_url');
    assert.ok(configContent.includes('requires_openai_auth = true'), 'native app auth gate');
    assert.ok(configContent.includes('env_key = "OPENAI_API_KEY"'), 'gateway API key source');
    assert.ok(
      !configContent.includes('[profiles.falcon]'),
      'desktop config should not use a profile section',
    );

    // auth.json carries API-key auth so the desktop skips the ChatGPT login.
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    assert.strictEqual(auth.auth_mode, 'apikey');
    assert.strictEqual(auth.OPENAI_API_KEY, 'sk-or-fake-key');

    // model.json catalog entry.
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const entry = catalog.models.find(
      (m: { slug: string; display_name: string }) => m.slug === 'deepseek/deepseek-v4',
    );
    assert.ok(entry, 'catalog should contain the model');
    assert.strictEqual(entry.display_name, 'deepseek/deepseek-v4 - openrouter');
    assert.strictEqual(entry.context_window, 163840);
    assert.deepStrictEqual(entry.input_modalities, ['text']);
    assert.strictEqual(entry.shell_type, 'shell_command');
    assert.strictEqual(entry.default_reasoning_level, 'medium');
    assert.ok(entry.description.length > 0);
    assert.deepStrictEqual(
      entry.supported_reasoning_levels.map((level: { effort: string }) => level.effort),
      ['low', 'medium', 'high', 'xhigh'],
    );

    // Codex reads this cache before refreshing model.json. It must be deliberately
    // stale and contain the same native-shaped rows so the app refreshes safely.
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.strictEqual(cache.fetched_at, '2000-01-01T00:00:00Z');
    assert.strictEqual(cache.client_version, '0.0.0');
    assert.deepStrictEqual(cache.models, catalog.models);
  });

  test('resolveConfig preserves native ChatGPT auth metadata for the desktop model picker', async () => {
    const primaryAuthPath = path.join(falconDir, 'primary-auth.json');
    const primaryAuth = {
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
      tokens: {
        access_token: 'fake-access-token',
        refresh_token: 'fake-refresh-token',
        id_token: 'fake-id-token',
        account_id: 'fake-account-id',
      },
      last_refresh: '2026-08-06T00:00:00Z',
    };
    fs.writeFileSync(primaryAuthPath, JSON.stringify(primaryAuth), { mode: 0o600 });
    process.env['FALCON_CODEX_APP_CHATGPT_AUTH_PATH'] = primaryAuthPath;

    try {
      await launcher.resolveConfig(
        {
          env: {
            OPENAI_API_KEY: 'sk-or-fake-key',
            OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
          },
          baseUrl: 'https://openrouter.ai/api/v1',
        },
        'openrouter',
        'sk-or-fake-key',
        'openrouter/free',
      );

      const isolatedAuth = JSON.parse(fs.readFileSync(path.join(codexAppDir, 'auth.json'), 'utf8'));
      assert.deepStrictEqual(isolatedAuth, primaryAuth);
      assert.notStrictEqual(isolatedAuth.OPENAI_API_KEY, 'sk-or-fake-key');
    } finally {
      process.env['FALCON_CODEX_APP_CHATGPT_AUTH_PATH'] = path.join(
        falconDir,
        'missing-primary-auth.json',
      );
    }
  });

  test('resolveConfig writes the selected gateway model catalog, with the selected model first', async () => {
    await launcher.resolveConfig(
      {
        env: {
          OPENAI_API_KEY: 'sk-or-fake-key',
          OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
        },
        baseUrl: 'https://openrouter.ai/api/v1',
      },
      'openrouter',
      'sk-or-fake-key',
      'vendor/model-b',
      [
        { id: 'vendor/model-a', name: 'Model A', contextLength: 32000 },
        { id: 'vendor/model-b', name: 'Model B', contextLength: 64000 },
        { id: 'vendor/model-c', name: 'Model C', contextLength: 128000 },
      ],
    );

    const catalog = JSON.parse(fs.readFileSync(path.join(codexAppDir, 'model.json'), 'utf8'));
    assert.deepStrictEqual(
      catalog.models.map((entry: { slug: string }) => entry.slug),
      ['vendor/model-b', 'vendor/model-a', 'vendor/model-c'],
    );
    assert.deepStrictEqual(
      catalog.models.map((entry: { priority: number }) => entry.priority),
      [0, 1, 2],
    );
    assert.strictEqual(catalog.models[0].display_name, 'vendor/model-b - openrouter');
    assert.strictEqual(catalog.models[0].context_window, 64000);
  });

  test('buildSpawnConfig launches the desktop Electron binary with --user-data-dir', async () => {
    const config: GatewayConfig = {
      env: {
        OPENAI_API_KEY: 'sk-openai-key',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
      },
      baseUrl: 'https://api.openai.com/v1',
    };
    const resolved = await launcher.resolveConfig(config, 'openai', 'sk-openai-key', 'gpt-4o');
    const spawnConfig = launcher.buildSpawnConfig(resolved, 'gpt-4o', []);

    const expectedBinary =
      process.env['CHATGPT_DESKTOP_PATH'] ||
      process.env['CODEX_DESKTOP_PATH'] ||
      '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT';
    assert.strictEqual(spawnConfig.command, expectedBinary);

    const expectedElectronDir = path.join(codexAppDir, 'electron-user-data');
    assert.deepStrictEqual(spawnConfig.args, [`--user-data-dir=${expectedElectronDir}`]);
    assert.strictEqual(spawnConfig.env['CHATGPT_ELECTRON_USER_DATA_PATH'], expectedElectronDir);
    assert.strictEqual(spawnConfig.env['CODEX_ELECTRON_USER_DATA_PATH'], expectedElectronDir);
    assert.strictEqual(spawnConfig.afterSpawn, undefined);
    assert.strictEqual(spawnConfig.detached, true);

    // The Electron binary ignores Codex's own CLI flags — none should be passed.
    assert.ok(!spawnConfig.args.includes('--profile'));
    assert.ok(!spawnConfig.args.includes('-m'));
    assert.ok(!spawnConfig.args.includes('-c'));
  });

  test('buildSpawnConfig forwards extra args after --user-data-dir', async () => {
    const config: GatewayConfig = { env: {}, baseUrl: 'https://api.openai.com/v1' };
    const resolved = await launcher.resolveConfig(config, 'openai', 'sk-openai-key', 'gpt-4o');
    const spawnConfig = launcher.buildSpawnConfig(resolved, 'gpt-4o', ['/path/to/workspace']);

    const expectedElectronDir = path.join(codexAppDir, 'electron-user-data');
    assert.deepStrictEqual(spawnConfig.args, [
      `--user-data-dir=${expectedElectronDir}`,
      '/path/to/workspace',
    ]);
  });

  test('buildSpawnConfig forwards an explicit caller-provided remote debugging port without adding a hook', async () => {
    const config: GatewayConfig = { env: {}, baseUrl: 'https://api.openai.com/v1' };
    const resolved = await launcher.resolveConfig(config, 'openai', 'sk-openai-key', 'gpt-4o');
    const spawnConfig = launcher.buildSpawnConfig(resolved, 'gpt-4o', [
      '--remote-debugging-port=9444',
      '/path/to/workspace',
    ]);

    const expectedElectronDir = path.join(codexAppDir, 'electron-user-data');
    assert.deepStrictEqual(spawnConfig.args, [
      `--user-data-dir=${expectedElectronDir}`,
      '--remote-debugging-port=9444',
      '/path/to/workspace',
    ]);
    assert.strictEqual(spawnConfig.afterSpawn, undefined);
  });

  test('buildSpawnConfig honors CODEX_DESKTOP_PATH override', async () => {
    const original = process.env['CODEX_DESKTOP_PATH'];
    process.env['CODEX_DESKTOP_PATH'] = '/custom/Codex';
    try {
      const config: GatewayConfig = { env: {}, baseUrl: 'https://api.openai.com/v1' };
      const resolved = await launcher.resolveConfig(config, 'openai', 'sk-openai-key', 'gpt-4o');
      const spawnConfig = launcher.buildSpawnConfig(resolved, 'gpt-4o', []);
      assert.strictEqual(spawnConfig.command, '/custom/Codex');
      assert.strictEqual(launcher.binaryName, '/custom/Codex');
    } finally {
      if (original !== undefined) {
        process.env['CODEX_DESKTOP_PATH'] = original;
      } else {
        delete process.env['CODEX_DESKTOP_PATH'];
      }
    }
  });

  test('buildSpawnConfig honors CHATGPT_DESKTOP_PATH override and takes precedence over CODEX_DESKTOP_PATH', async () => {
    const originalChatgpt = process.env['CHATGPT_DESKTOP_PATH'];
    const originalCodex = process.env['CODEX_DESKTOP_PATH'];
    process.env['CHATGPT_DESKTOP_PATH'] = '/custom/ChatGPT';
    process.env['CODEX_DESKTOP_PATH'] = '/custom/Codex';
    try {
      const config: GatewayConfig = { env: {}, baseUrl: 'https://api.openai.com/v1' };
      const resolved = await launcher.resolveConfig(config, 'openai', 'sk-openai-key', 'gpt-4o');
      const spawnConfig = launcher.buildSpawnConfig(resolved, 'gpt-4o', []);
      assert.strictEqual(spawnConfig.command, '/custom/ChatGPT');
      assert.strictEqual(launcher.binaryName, '/custom/ChatGPT');
    } finally {
      if (originalChatgpt !== undefined) {
        process.env['CHATGPT_DESKTOP_PATH'] = originalChatgpt;
      } else {
        delete process.env['CHATGPT_DESKTOP_PATH'];
      }
      if (originalCodex !== undefined) {
        process.env['CODEX_DESKTOP_PATH'] = originalCodex;
      } else {
        delete process.env['CODEX_DESKTOP_PATH'];
      }
    }
  });

  test('resolveConfig handles the anthropic gateway via bifrost', async () => {
    const config: GatewayConfig = {
      env: {
        OPENAI_API_KEY: 'sk-ant-key',
        OPENAI_BASE_URL: 'http://localhost:8080/openai',
      },
      baseUrl: 'http://localhost:8080/openai',
    };

    mock.method(bifrost, 'startBifrost', async () => ({
      port: 9999,
      appDir: '/fake/dir',
      proc: {} as ChildProcess,
      cleanup: () => {},
    }));

    try {
      const resolved = await launcher.resolveConfig(
        config,
        'anthropic',
        'sk-ant-key',
        'claude-sonnet-4-20250514',
      );
      assert.strictEqual(resolved.baseUrl, 'http://localhost:9999/openai');

      const configContent = fs.readFileSync(path.join(codexAppDir, 'config.toml'), 'utf8');
      assert.ok(configContent.includes('model = "claude-sonnet-4-20250514"'));
      assert.ok(configContent.includes('model_provider = "localhost"'));
      assert.ok(configContent.includes('base_url = "http://localhost:9999/openai/"'));
    } finally {
      mock.reset();
    }
  });

  test('re-running is idempotent — no duplicate top-level keys or provider sections', async () => {
    const config: GatewayConfig = {
      env: {
        OPENAI_API_KEY: 'sk-or-fake-key',
        OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
      },
      baseUrl: 'https://openrouter.ai/api/v1',
    };

    await launcher.resolveConfig(config, 'openrouter', 'sk-or-fake-key', 'model-a');
    await launcher.resolveConfig(config, 'openrouter', 'sk-or-fake-key', 'model-b');

    const configContent = fs.readFileSync(path.join(codexAppDir, 'config.toml'), 'utf8');

    const modelMatches = configContent.match(/^model = /gm) ?? [];
    assert.strictEqual(modelMatches.length, 1, 'exactly one top-level model key');
    assert.ok(configContent.includes('model = "model-b"'), 'model should be updated to latest');

    const providerMatches = configContent.match(/\[model_providers\.openrouter-ai\]/g) ?? [];
    assert.strictEqual(providerMatches.length, 1, 'exactly one provider section');

    // Both models accumulate in the catalog.
    const catalog = JSON.parse(fs.readFileSync(path.join(codexAppDir, 'model.json'), 'utf8'));
    const slugs = catalog.models.map((m: { slug: string }) => m.slug);
    assert.ok(slugs.includes('model-a'));
    assert.ok(slugs.includes('model-b'));
  });
});
