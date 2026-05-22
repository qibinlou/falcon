import assert from 'node:assert';
import { describe, test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GatewayConfig } from '../gateways/index.js';
import { ClaudeLauncher } from './claude.js';
import { ENV_CLAUDE_CONFIG_DIR } from '../constants.js';

describe('Claude Agent Launcher', () => {
  const launcher = new ClaudeLauncher();

  test('should have correct details', () => {
    assert.strictEqual(launcher.name, 'Claude Code');
    assert.strictEqual(launcher.slug, 'claude');
  });

  test('buildSpawnConfig should handle model and extra arguments', () => {
    const resolved = { env: {} };
    const config = launcher.buildSpawnConfig(resolved, 'claude-3-5-sonnet', ['--verbose', 'hello']);
    assert.strictEqual(config.command, 'claude');
    assert.deepStrictEqual(config.args, [
      '--model',
      'claude-3-5-sonnet',
      '--dangerously-skip-permissions',
      '--verbose',
      'hello',
    ]);
  });

  test('buildSpawnConfig should work without a model', () => {
    const resolved = { env: {} };
    const config = launcher.buildSpawnConfig(resolved, '', []);
    assert.deepStrictEqual(config.args, ['--dangerously-skip-permissions']);
  });

  test('resolveConfig should preserve Anthropic API key and unset auth token for official base URL', async () => {
    const config: GatewayConfig = {
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-testkey',
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        SOME_OTHER_VAR: 'value',
      },
    };

    const resolved = await launcher.resolveConfig(
      config,
      'anthropic',
      'sk-ant-testkey',
      'claude-opus-model',
    );
    const env = resolved.env;

    assert.strictEqual(env['ANTHROPIC_AUTH_TOKEN'], undefined);
    assert.strictEqual(env['ANTHROPIC_API_KEY'], 'sk-ant-testkey');
    assert.strictEqual(env['CLAUDE_CODE_ATTRIBUTION_HEADER'], '0');
    assert.strictEqual(env['ANTHROPIC_DEFAULT_OPUS_MODEL'], 'claude-opus-model');
    assert.strictEqual(env['ANTHROPIC_DEFAULT_SONNET_MODEL'], 'claude-opus-model');
    assert.strictEqual(env['ANTHROPIC_DEFAULT_HAIKU_MODEL'], 'claude-opus-model');
    assert.strictEqual(env['CLAUDE_CODE_SUBAGENT_MODEL'], 'claude-opus-model');
    assert.strictEqual(env['SOME_OTHER_VAR'], 'value');
  });

  test('resolveConfig should perform token swap for third-party or missing base URL', async () => {
    const config: GatewayConfig = {
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-testkey',
        SOME_OTHER_VAR: 'value',
      },
    };

    const resolved = await launcher.resolveConfig(
      config,
      'anthropic',
      'sk-ant-testkey',
      'claude-opus-model',
    );
    const env = resolved.env;

    assert.strictEqual(env['ANTHROPIC_AUTH_TOKEN'], 'sk-ant-testkey');
    assert.strictEqual(env['ANTHROPIC_API_KEY'], '');
    assert.strictEqual(env['CLAUDE_CODE_ATTRIBUTION_HEADER'], '0');
    assert.strictEqual(env['ANTHROPIC_DEFAULT_OPUS_MODEL'], 'claude-opus-model');
    assert.strictEqual(env['ANTHROPIC_DEFAULT_SONNET_MODEL'], 'claude-opus-model');
    assert.strictEqual(env['ANTHROPIC_DEFAULT_HAIKU_MODEL'], 'claude-opus-model');
    assert.strictEqual(env['CLAUDE_CODE_SUBAGENT_MODEL'], 'claude-opus-model');
    assert.strictEqual(env['SOME_OTHER_VAR'], 'value');
  });

  test('resolveConfig should recognize various official base URL formats', async () => {
    const urls = [
      'https://api.anthropic.com',
      'https://api.anthropic.com/',
      'https://api.anthropic.com/v1',
      'https://api.anthropic.com/v1/',
    ];

    for (const url of urls) {
      const config: GatewayConfig = {
        env: {
          ANTHROPIC_API_KEY: 'sk-ant-testkey',
          ANTHROPIC_BASE_URL: url,
        },
      };

      const resolved = await launcher.resolveConfig(
        config,
        'anthropic',
        'sk-ant-testkey',
        'claude-opus-model',
      );
      const env = resolved.env;
      assert.strictEqual(env['ANTHROPIC_AUTH_TOKEN'], undefined, `Failed for URL: ${url}`);
      assert.strictEqual(env['ANTHROPIC_API_KEY'], 'sk-ant-testkey', `Failed for URL: ${url}`);
    }
  });

  test('resolveConfig should swap key to token for custom third-party base URLs', async () => {
    const urls = [
      'https://openrouter.ai/api/v1',
      'http://localhost:8080/anthropic',
      'https://gateway.ai.cloudflare.com/v1',
    ];

    for (const url of urls) {
      const config: GatewayConfig = {
        env: {
          ANTHROPIC_API_KEY: 'sk-ant-testkey',
          ANTHROPIC_BASE_URL: url,
        },
      };

      const resolved = await launcher.resolveConfig(
        config,
        'anthropic',
        'sk-ant-testkey',
        'claude-opus-model',
      );
      const env = resolved.env;
      assert.strictEqual(env['ANTHROPIC_AUTH_TOKEN'], 'sk-ant-testkey', `Failed for URL: ${url}`);
      assert.strictEqual(env['ANTHROPIC_API_KEY'], '', `Failed for URL: ${url}`);
    }
  });

  test('resolveConfig should set CLAUDE_CONFIG_DIR and create it if not dry-run', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
    const testConfigDir = path.join(tempDir, 'claude');
    process.env[ENV_CLAUDE_CONFIG_DIR] = testConfigDir;

    try {
      const config: GatewayConfig = {
        env: {
          ANTHROPIC_API_KEY: 'sk-ant-testkey',
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        },
      };

      const resolved = await launcher.resolveConfig(
        config,
        'anthropic',
        'sk-ant-testkey',
        'claude-model',
      );

      assert.strictEqual(resolved.env[ENV_CLAUDE_CONFIG_DIR], testConfigDir);
      assert.ok(fs.existsSync(testConfigDir), 'Claude config directory should be created');
    } finally {
      delete process.env[ENV_CLAUDE_CONFIG_DIR];
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });
});
