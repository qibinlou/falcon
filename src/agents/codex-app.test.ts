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
  const launcher = new CodexAppLauncher();

  before(() => {
    originalFalconDir = process.env[ENV_FALCON_DIR];
    originalCodexHome = process.env[ENV_CODEX_HOME];
    falconDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-app-test-'));
    process.env[ENV_FALCON_DIR] = falconDir;
    // A global CODEX_HOME must NOT redirect the desktop dir — it should always
    // live under FALCON_DIR/codex-app to stay isolated from the user's ~/.codex.
    delete process.env[ENV_CODEX_HOME];
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
    }
    if (fs.existsSync(falconDir)) {
      fs.rmSync(falconDir, { recursive: true, force: true });
    }
  });

  test('should have correct details', () => {
    assert.strictEqual(launcher.name, 'Codex Desktop App');
    assert.strictEqual(launcher.slug, 'codex-app');
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

    assert.ok(fs.existsSync(configPath), 'config.toml should exist');
    assert.ok(fs.existsSync(catalogPath), 'model.json should exist');
    assert.ok(fs.existsSync(authPath), 'auth.json should exist');

    // The desktop app reads top-level keys (it has no profile to activate).
    const configContent = fs.readFileSync(configPath, 'utf8');
    assert.ok(configContent.includes('model = "deepseek/deepseek-v4"'), 'top-level model');
    assert.ok(configContent.includes('model_provider = "openrouter-ai"'), 'top-level provider');
    assert.ok(configContent.includes(`model_catalog_json = "${catalogPath}"`), 'top-level catalog');
    assert.ok(configContent.includes('[model_providers.openrouter-ai]'), 'provider section');
    assert.ok(configContent.includes('base_url = "https://openrouter.ai/api/v1/"'), 'base_url');
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
    const entry = catalog.models.find((m: { slug: string }) => m.slug === 'deepseek/deepseek-v4');
    assert.ok(entry, 'catalog should contain the model');
    assert.strictEqual(entry.context_window, 163840);
    assert.deepStrictEqual(entry.input_modalities, ['text']);
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
      process.env['CODEX_DESKTOP_PATH'] || '/Applications/Codex.app/Contents/MacOS/Codex';
    assert.strictEqual(spawnConfig.command, expectedBinary);

    const expectedElectronDir = path.join(codexAppDir, 'electron-user-data');
    assert.deepStrictEqual(spawnConfig.args, [`--user-data-dir=${expectedElectronDir}`]);
    assert.strictEqual(spawnConfig.env['CODEX_ELECTRON_USER_DATA_PATH'], expectedElectronDir);

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

  test('buildSpawnConfig honors CODEX_DESKTOP_PATH override', async () => {
    const original = process.env['CODEX_DESKTOP_PATH'];
    process.env['CODEX_DESKTOP_PATH'] = '/custom/Codex';
    try {
      const config: GatewayConfig = { env: {}, baseUrl: 'https://api.openai.com/v1' };
      const resolved = await launcher.resolveConfig(config, 'openai', 'sk-openai-key', 'gpt-4o');
      const spawnConfig = launcher.buildSpawnConfig(resolved, 'gpt-4o', []);
      assert.strictEqual(spawnConfig.command, '/custom/Codex');
    } finally {
      if (original !== undefined) {
        process.env['CODEX_DESKTOP_PATH'] = original;
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
