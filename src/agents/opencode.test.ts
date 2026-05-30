import assert from 'node:assert';
import { describe, test, mock } from 'node:test';
import fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GatewayConfig } from '../gateways/index.js';
import { OpencodeLauncher } from './opencode.js';
import { ENV_OPENCODE_CONFIG_DIR, ENV_FALCON_DIR, DEFAULT_FALCON_DIR } from '../constants.js';

describe('OpenCode Agent Launcher', () => {
  const launcher = new OpencodeLauncher();

  test('should have correct details', () => {
    assert.strictEqual(launcher.name, 'OpenCode');
    assert.strictEqual(launcher.slug, 'opencode');
  });

  test('buildSpawnConfig should handle model and extra arguments', () => {
    const resolved = { env: { FALCON_GATEWAY_SLUG: 'openai' } };
    const config = launcher.buildSpawnConfig(resolved, 'openai/gpt-4o', ['--verbose', 'hello']);
    assert.strictEqual(config.command, 'opencode');
    assert.deepStrictEqual(config.args, ['--model', 'openai/gpt-4o', '--verbose', 'hello']);
  });

  test('buildSpawnConfig should convert prompt argument to run subcommand', () => {
    const resolved = { env: { FALCON_GATEWAY_SLUG: 'openai' } };
    const config = launcher.buildSpawnConfig(resolved, 'openai/gpt-4o', [
      '-p',
      'Hello, world!',
      '--verbose',
    ]);
    assert.deepStrictEqual(config.args, [
      'run',
      'Hello, world!',
      '--model',
      'openai/gpt-4o',
      '--verbose',
    ]);

    const config2 = launcher.buildSpawnConfig(resolved, 'openai/gpt-4o:free', [
      '--prompt',
      'Test prompt',
    ]);
    assert.deepStrictEqual(config2.args, ['run', 'Test prompt', '--model', 'openai/gpt-4o']);
  });

  test('buildSpawnConfig should normalize model ID', () => {
    const resolved = { env: { FALCON_GATEWAY_SLUG: 'openrouter' } };
    const config = launcher.buildSpawnConfig(resolved, 'deepseek/deepseek-v4-flash:free', []);
    assert.deepStrictEqual(config.args, ['--model', 'openrouter/deepseek/deepseek-v4-flash']);
  });

  test('resolveConfig should set OPENCODE_CONFIG_DIR and create it', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-opencode-test-'));
    const testConfigDir = path.join(tempDir, 'opencode');
    process.env[ENV_OPENCODE_CONFIG_DIR] = testConfigDir;

    try {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-test',
        },
      };

      const resolved = await launcher.resolveConfig(config, 'openai', 'sk-test', 'gpt-4o');

      assert.strictEqual(resolved.env[ENV_OPENCODE_CONFIG_DIR], testConfigDir);
      assert.ok(fs.existsSync(testConfigDir), 'OpenCode config directory should be created');
    } finally {
      delete process.env[ENV_OPENCODE_CONFIG_DIR];
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('resolveConfig should fallback to FALCON_DIR/opencode when OPENCODE_CONFIG_DIR is not set', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-opencode-test-'));
    const originalFalconDir = process.env[ENV_FALCON_DIR];
    const originalConfigDir = process.env[ENV_OPENCODE_CONFIG_DIR];

    process.env[ENV_FALCON_DIR] = tempDir;
    delete process.env[ENV_OPENCODE_CONFIG_DIR];

    try {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-test',
        },
      };

      const resolved = await launcher.resolveConfig(config, 'openai', 'sk-test', 'gpt-4o');

      const expectedDir = path.join(tempDir, 'opencode');
      assert.strictEqual(resolved.env[ENV_OPENCODE_CONFIG_DIR], expectedDir);
      assert.ok(
        fs.existsSync(expectedDir),
        'OpenCode config directory should be created in FALCON_DIR',
      );
    } finally {
      if (originalFalconDir !== undefined) {
        process.env[ENV_FALCON_DIR] = originalFalconDir;
      } else {
        delete process.env[ENV_FALCON_DIR];
      }
      if (originalConfigDir !== undefined) {
        process.env[ENV_OPENCODE_CONFIG_DIR] = originalConfigDir;
      } else {
        delete process.env[ENV_OPENCODE_CONFIG_DIR];
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('resolveConfig should fallback to DEFAULT_FALCON_DIR/opencode when neither is set', async () => {
    const originalFalconDir = process.env[ENV_FALCON_DIR];
    const originalConfigDir = process.env[ENV_OPENCODE_CONFIG_DIR];

    delete process.env[ENV_FALCON_DIR];
    delete process.env[ENV_OPENCODE_CONFIG_DIR];

    mock.method(fs, 'mkdirSync', () => {});
    mock.method(fs, 'existsSync', () => true);

    try {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-test',
        },
      };

      const resolved = await launcher.resolveConfig(config, 'openai', 'sk-test', 'gpt-4o');

      const expectedDir = path.join(DEFAULT_FALCON_DIR, 'opencode');
      assert.strictEqual(resolved.env[ENV_OPENCODE_CONFIG_DIR], expectedDir);
    } finally {
      mock.reset();
      if (originalFalconDir !== undefined) {
        process.env[ENV_FALCON_DIR] = originalFalconDir;
      }
      if (originalConfigDir !== undefined) {
        process.env[ENV_OPENCODE_CONFIG_DIR] = originalConfigDir;
      }
    }
  });
});
