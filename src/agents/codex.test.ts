import assert from 'node:assert';
import { after, before, describe, test, mock } from 'node:test';
import type { ChildProcess } from 'child_process';
import child_process from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { GatewayConfig } from '../gateways/index.js';
import { CodexLauncher } from './codex.js';
import { bifrost } from './shared/bifrost.js';
import { ENV_CODEX_HOME, ENV_FALCON_DIR, DEFAULT_FALCON_DIR } from '../constants.js';
import {
  clearModelMetadataCache,
  setLocalModelMetadataCache,
} from '../gateways/shared/modelEnricher.js';

describe('Codex Agent Launcher', () => {
  let tempDir: string;
  let originalCodexHome: string | undefined;
  const launcher = new CodexLauncher();

  before(() => {
    originalCodexHome = process.env[ENV_CODEX_HOME];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    process.env[ENV_CODEX_HOME] = tempDir;
    setLocalModelMetadataCache({
      'gpt-4o': {
        contextLength: 128000,
        modalities: ['text', 'image'],
        pricing: { prompt: '$2.50/1M', completion: '$10.00/1M', promptPerM: 2.5 },
      },
      'deepseek/deepseek-v4-flash:free': {
        contextLength: 163840,
        modalities: ['text'],
        pricing: { prompt: '$0.00/1M', completion: '$0.00/1M', promptPerM: 0 },
      },
      'deepseek-v4-flash': {
        contextLength: 163840,
        modalities: ['text'],
        pricing: { prompt: '$0.00/1M', completion: '$0.00/1M', promptPerM: 0 },
      },
      'claude-sonnet-4': {
        contextLength: 200000,
        modalities: ['text', 'image'],
        pricing: { prompt: '$3.00/1M', completion: '$15.00/1M', promptPerM: 3 },
      },
    });
  });

  after(() => {
    clearModelMetadataCache();
    if (originalCodexHome !== undefined) {
      process.env[ENV_CODEX_HOME] = originalCodexHome;
    } else {
      delete process.env[ENV_CODEX_HOME];
    }
    // Clean up tempDir
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should have correct details', () => {
    assert.strictEqual(launcher.name, 'Codex');
    assert.strictEqual(launcher.slug, 'codex');
  });

  test('resolveConfig should pass through env vars and create/configure config.toml', async () => {
    const config: GatewayConfig = {
      env: {
        OPENAI_API_KEY: 'sk-openai-key',
        OPENAI_BASE_URL: 'https://api.openai.com/v1',
      },
      baseUrl: 'https://api.openai.com/v1',
    };

    const resolved = await launcher.resolveConfig(config, 'openai', 'sk-openai-key', 'gpt-4o');
    assert.deepStrictEqual(resolved.env, {
      OPENAI_API_KEY: 'sk-openai-key',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
      [ENV_CODEX_HOME]: tempDir,
    });

    const spawnConfig = launcher.buildSpawnConfig(resolved, 'gpt-4o', ['--verbose']);

    // Check args return values
    assert.ok(spawnConfig.args.includes('--profile'));
    assert.ok(spawnConfig.args.includes('falcon'));
    assert.ok(spawnConfig.args.includes('-m'));
    assert.ok(spawnConfig.args.includes('gpt-4o'));
    assert.ok(spawnConfig.args.includes('--verbose'));

    // Check files generated in tempDir
    const configPath = path.join(tempDir, 'config.toml');
    const catalogPath = path.join(tempDir, 'model.json');

    assert.ok(fs.existsSync(configPath), 'config.toml should exist');
    assert.ok(fs.existsSync(catalogPath), 'model.json should exist');

    // Verify falcon.config.toml and config.toml contents
    const profilePath = path.join(tempDir, 'falcon.config.toml');
    assert.ok(fs.existsSync(profilePath), 'falcon.config.toml should exist');
    const profileContent = fs.readFileSync(profilePath, 'utf8');
    assert.ok(profileContent.includes('model = "gpt-4o"'));
    assert.ok(profileContent.includes('model_provider = "api-openai-com"'));

    const configContent = fs.readFileSync(configPath, 'utf8');
    assert.ok(
      !configContent.includes('[profiles.falcon]'),
      'config.toml should not contain legacy profile section',
    );

    // Verify model.json contents
    const catalogContent = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    assert.ok(Array.isArray(catalogContent.models));
    const modelEntry = catalogContent.models.find(
      (m: { slug: string; display_name: string }) => m.slug === 'gpt-4o',
    );
    assert.ok(modelEntry);
    assert.strictEqual(modelEntry.display_name, 'gpt-4o');
    assert.strictEqual(modelEntry.context_window, 128000);
    assert.deepStrictEqual(modelEntry.input_modalities, ['text', 'image']);
  });

  test('resolveConfig should handle custom base URL configuration when gateway is anthropic', async () => {
    const config: GatewayConfig = {
      env: {
        OPENAI_API_KEY: 'sk-ant-key',
        OPENAI_BASE_URL: 'http://localhost:8080/openai',
      },
      baseUrl: 'http://localhost:8080/openai',
    };

    mock.method(bifrost, 'startBifrost', async () => {
      return {
        port: 9999,
        appDir: '/fake/dir',
        proc: {} as ChildProcess,
        cleanup: () => {},
      };
    });

    try {
      const resolved = await launcher.resolveConfig(
        config,
        'anthropic',
        'sk-ant-key',
        'claude-sonnet-4-20250514',
      );
      assert.strictEqual(resolved.baseUrl, 'http://localhost:9999/openai');

      // Check files generated in tempDir
      const configPath = path.join(tempDir, 'config.toml');
      assert.ok(fs.existsSync(configPath), 'config.toml should exist');

      // Verify falcon.config.toml and config.toml contents
      const profilePath = path.join(tempDir, 'falcon.config.toml');
      assert.ok(fs.existsSync(profilePath), 'falcon.config.toml should exist');
      const profileContent = fs.readFileSync(profilePath, 'utf8');
      assert.ok(profileContent.includes('model = "claude-sonnet-4-20250514"'));
      assert.ok(profileContent.includes('model_provider = "localhost"'));

      const configContent = fs.readFileSync(configPath, 'utf8');
      assert.ok(configContent.includes('base_url = "http://localhost:9999/openai/"'));
      assert.ok(
        !configContent.includes('[profiles.falcon]'),
        'config.toml should not contain legacy profile section',
      );
    } finally {
      mock.reset();
    }
  });

  test('resolveConfig should fallback to FALCON_DIR/codex when CODEX_HOME is not set', async () => {
    const falconTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
    const originalFalconDir = process.env[ENV_FALCON_DIR];
    const originalCodexHome = process.env[ENV_CODEX_HOME];

    process.env[ENV_FALCON_DIR] = falconTempDir;
    delete process.env[ENV_CODEX_HOME];

    try {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-openai-key',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
        },
      };

      const resolved = await launcher.resolveConfig(config, 'openai', 'sk-openai-key', 'gpt-4o');

      const expectedDir = path.join(falconTempDir, 'codex');
      assert.strictEqual(resolved.env[ENV_CODEX_HOME], expectedDir);
      assert.ok(
        fs.existsSync(expectedDir),
        'Codex config directory should be created in FALCON_DIR',
      );
    } finally {
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
      try {
        fs.rmSync(falconTempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('resolveConfig should fallback to DEFAULT_FALCON_DIR/codex when neither is set', async () => {
    const originalFalconDir = process.env[ENV_FALCON_DIR];
    const originalCodexHome = process.env[ENV_CODEX_HOME];

    delete process.env[ENV_FALCON_DIR];
    delete process.env[ENV_CODEX_HOME];

    // Mock fs.mkdirSync and fs.existsSync to prevent writing to ~/.falcon
    mock.method(fs, 'mkdirSync', () => {});
    mock.method(fs, 'existsSync', () => true);

    try {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-openai-key',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
        },
      };

      const resolved = await launcher.resolveConfig(config, 'openai', 'sk-openai-key', 'gpt-4o');

      const expectedDir = path.join(DEFAULT_FALCON_DIR, 'codex');
      assert.strictEqual(resolved.env[ENV_CODEX_HOME], expectedDir);
    } finally {
      mock.reset();
      if (originalFalconDir !== undefined) {
        process.env[ENV_FALCON_DIR] = originalFalconDir;
      }
      if (originalCodexHome !== undefined) {
        process.env[ENV_CODEX_HOME] = originalCodexHome;
      }
    }
  });

  describe('idempotency and file side-effects', () => {
    let sideEffectDir: string;

    before(() => {
      sideEffectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-side-effects-'));
    });

    after(() => {
      if (fs.existsSync(sideEffectDir)) {
        fs.rmSync(sideEffectDir, { recursive: true, force: true });
      }
    });

    test('should write config.toml and model.json with correct settings', async () => {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-or-fake-key',
          OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
        },
        baseUrl: 'https://openrouter.ai/api/v1',
      };

      // Set CODEX_HOME specifically
      process.env[ENV_CODEX_HOME] = sideEffectDir;

      await launcher.resolveConfig(
        config,
        'openrouter',
        'sk-or-fake-key',
        'deepseek/deepseek-v4-flash:free',
      );

      const configPath = path.join(sideEffectDir, 'config.toml');
      const catalogPath = path.join(sideEffectDir, 'model.json');

      assert.ok(fs.existsSync(configPath), 'config.toml should exist');
      assert.ok(fs.existsSync(catalogPath), 'model.json should exist');

      const profilePath = path.join(sideEffectDir, 'falcon.config.toml');
      assert.ok(fs.existsSync(profilePath), 'falcon.config.toml should exist');
      const profileContent = fs.readFileSync(profilePath, 'utf8');
      assert.ok(
        profileContent.includes('model = "deepseek/deepseek-v4-flash:free"'),
        'falcon.config.toml missing model',
      );
      assert.ok(
        profileContent.includes('forced_login_method = "api"'),
        'falcon.config.toml missing forced_login_method',
      );

      const configContent = fs.readFileSync(configPath, 'utf8');
      assert.ok(configContent.includes('openrouter.ai'), 'config.toml missing openrouter base_url');
      assert.ok(
        !configContent.includes('[profiles.falcon]'),
        'config.toml should not contain legacy profile section',
      );

      const catalogContent = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      const entry = catalogContent.models.find(
        (m: { slug: string }) => m.slug === 'deepseek/deepseek-v4-flash:free',
      );
      assert.ok(entry, 'model.json missing entry');
      assert.strictEqual(entry.context_window, 163840);
      assert.deepStrictEqual(entry.input_modalities, ['text']);
    });

    test('re-running is idempotent — no duplicate entries or sections', async () => {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-or-fake-key',
          OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
        },
        baseUrl: 'https://openrouter.ai/api/v1',
      };

      process.env[ENV_CODEX_HOME] = sideEffectDir;

      // Run it multiple times
      await launcher.resolveConfig(
        config,
        'openrouter',
        'sk-or-fake-key',
        'deepseek/deepseek-v4-flash:free',
      );
      await launcher.resolveConfig(
        config,
        'openrouter',
        'sk-or-fake-key',
        'deepseek/deepseek-v4-flash:free',
      );

      const configPath = path.join(sideEffectDir, 'config.toml');
      const catalogPath = path.join(sideEffectDir, 'model.json');

      const profilePath = path.join(sideEffectDir, 'falcon.config.toml');
      const profileContent = fs.readFileSync(profilePath, 'utf8');
      const modelMatches = profileContent.match(/model = /g) ?? [];
      assert.strictEqual(
        modelMatches.length,
        1,
        'falcon.config.toml should have exactly one model setting',
      );

      const configContent = fs.readFileSync(configPath, 'utf8');
      const providerMatches = configContent.match(/\[model_providers\.openrouter-ai\]/g) ?? [];
      assert.strictEqual(
        providerMatches.length,
        1,
        'config.toml should have exactly one openrouter-ai provider section',
      );
      assert.ok(
        !configContent.includes('[profiles.falcon]'),
        'config.toml should not contain legacy profile section',
      );

      const catalogContent = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      const entries = catalogContent.models.filter(
        (m: { slug: string }) => m.slug === 'deepseek/deepseek-v4-flash:free',
      );
      assert.strictEqual(entries.length, 1, 'should have exactly one model entry');
    });

    test('different model writes distinct entry without removing old one', async () => {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-or-fake-key',
          OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
        },
        baseUrl: 'https://openrouter.ai/api/v1',
      };

      process.env[ENV_CODEX_HOME] = sideEffectDir;

      await launcher.resolveConfig(
        config,
        'openrouter',
        'sk-or-fake-key',
        'deepseek/deepseek-v4-flash:free',
      );
      await launcher.resolveConfig(config, 'openrouter', 'sk-or-fake-key', 'gpt-4o');

      const catalogPath = path.join(sideEffectDir, 'model.json');
      const catalogContent = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      const slugs = catalogContent.models.map((m: { slug: string }) => m.slug);
      assert.ok(slugs.includes('deepseek/deepseek-v4-flash:free'));
      assert.ok(slugs.includes('gpt-4o'));
    });

    test('should clean up legacy profiles.falcon and profile = "falcon" from config.toml', async () => {
      const configPath = path.join(sideEffectDir, 'config.toml');
      const legacyConfig = `
profile = "falcon"

[profiles.falcon]
model = "legacy-model"
model_provider = "legacy-provider"

[model_providers.legacy-provider]
name = "legacy-provider"
`;
      fs.writeFileSync(configPath, legacyConfig, 'utf8');

      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-or-fake-key',
          OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
        },
        baseUrl: 'https://openrouter.ai/api/v1',
      };

      process.env[ENV_CODEX_HOME] = sideEffectDir;

      await launcher.resolveConfig(
        config,
        'openrouter',
        'sk-or-fake-key',
        'deepseek/deepseek-v4-flash:free',
      );

      const configContent = fs.readFileSync(configPath, 'utf8');
      assert.ok(
        !configContent.includes('[profiles.falcon]'),
        'should remove legacy [profiles.falcon] section',
      );
      assert.ok(
        !configContent.includes('profile = "falcon"'),
        'should remove legacy profile = "falcon" line',
      );
      assert.ok(
        configContent.includes('[model_providers.legacy-provider]'),
        'should retain other existing sections',
      );
      assert.ok(
        configContent.includes('[model_providers.openrouter-ai]'),
        'should add new provider section',
      );

      const profilePath = path.join(sideEffectDir, 'falcon.config.toml');
      assert.ok(fs.existsSync(profilePath), 'falcon.config.toml should exist');
      const profileContent = fs.readFileSync(profilePath, 'utf8');
      assert.ok(profileContent.includes('model = "deepseek/deepseek-v4-flash:free"'));
    });

    test('should throw error if Codex CLI version is < 0.134.0', async () => {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-or-fake-key',
          OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
        },
        baseUrl: 'https://openrouter.ai/api/v1',
      };

      process.env[ENV_CODEX_HOME] = sideEffectDir;

      // Mock spawnSync to return an older version
      const spawnSyncMock = mock.method(child_process, 'spawnSync', () => {
        return {
          status: 0,
          stdout: 'codex-cli 0.130.0',
          stderr: '',
        } as unknown as child_process.SpawnSyncReturns<string>;
      });

      try {
        await assert.rejects(
          launcher.resolveConfig(
            config,
            'openrouter',
            'sk-or-fake-key',
            'deepseek/deepseek-v4-flash:free',
          ),
          /Falcon requires Codex CLI >= 0.134.0/,
        );
      } finally {
        spawnSyncMock.mock.restore();
      }
    });
  });
});
