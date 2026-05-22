import assert from 'node:assert';
import { after, before, describe, test } from 'node:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { GatewayConfig } from '../gateways/index.js';
import { CodexLauncher } from './codex.js';
import { ENV_CODEX_HOME, ENV_FALCON_DIR, DEFAULT_FALCON_DIR } from '../constants.js';

describe('Codex Agent Launcher', () => {
  let tempDir: string;
  let originalCodexHome: string | undefined;
  const launcher = new CodexLauncher();

  before(() => {
    originalCodexHome = process.env[ENV_CODEX_HOME];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-'));
    process.env[ENV_CODEX_HOME] = tempDir;
  });

  after(() => {
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

    // Verify config.toml contents
    const configContent = fs.readFileSync(configPath, 'utf8');
    assert.ok(configContent.includes('[profiles.falcon]'));
    assert.ok(configContent.includes('model = "gpt-4o"'));
    assert.ok(configContent.includes('model_provider = "api-openai-com"'));

    // Verify model.json contents
    const catalogContent = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    assert.ok(Array.isArray(catalogContent.models));
    const modelEntry = catalogContent.models.find(
      (m: { slug: string; display_name: string }) => m.slug === 'gpt-4o',
    );
    assert.ok(modelEntry);
    assert.strictEqual(modelEntry.display_name, 'gpt-4o');
    assert.strictEqual(modelEntry.context_window, 128000);
  });

  test('resolveConfig should handle dryRun or custom base URL configuration when gateway is anthropic', async () => {
    const config: GatewayConfig = {
      env: {
        OPENAI_API_KEY: 'sk-ant-key',
        OPENAI_BASE_URL: 'http://localhost:8080/openai',
      },
      baseUrl: 'http://localhost:8080/openai',
    };

    const resolved = await launcher.resolveConfig(
      config,
      'anthropic',
      'sk-ant-key',
      'claude-sonnet-4-20250514',
      { dryRun: true },
    );
    assert.strictEqual(resolved.baseUrl, 'http://localhost:<BIFROST_PORT>/openai');

    // Check files generated in tempDir
    const configPath = path.join(tempDir, 'config.toml');
    assert.ok(fs.existsSync(configPath), 'config.toml should exist');

    // Verify config.toml contents
    const configContent = fs.readFileSync(configPath, 'utf8');
    assert.ok(configContent.includes('[profiles.falcon]'));
    assert.ok(configContent.includes('model = "claude-sonnet-4-20250514"'));
    assert.ok(configContent.includes('model_provider = "localhost"'));
    assert.ok(configContent.includes('base_url = "http://localhost:<BIFROST_PORT>/openai/"'));
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

    try {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-openai-key',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
        },
      };

      const resolved = await launcher.resolveConfig(config, 'openai', 'sk-openai-key', 'gpt-4o', {
        dryRun: true,
      });

      const expectedDir = path.join(DEFAULT_FALCON_DIR, 'codex');
      assert.strictEqual(resolved.env[ENV_CODEX_HOME], expectedDir);
    } finally {
      if (originalFalconDir !== undefined) {
        process.env[ENV_FALCON_DIR] = originalFalconDir;
      }
      if (originalCodexHome !== undefined) {
        process.env[ENV_CODEX_HOME] = originalCodexHome;
      }
    }
  });
});
