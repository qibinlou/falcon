import assert from 'node:assert';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { ENV_FALCON_DIR, ENV_PI_CONFIG_DIR } from '../constants.js';
import type { GatewayConfig } from '../gateways/index.js';
import { PiLauncher } from './pi.js';

describe('Pi Agent Launcher', () => {
  const launcher = new PiLauncher();

  test('should have correct details', () => {
    assert.strictEqual(launcher.name, 'Pi');
    assert.strictEqual(launcher.slug, 'pi');
    assert.strictEqual(launcher.binaryName, 'pi');
  });

  test('should have install command for pi coding agent', () => {
    assert.strictEqual(
      launcher.installCommand,
      'npm install -g --ignore-scripts @earendil-works/pi-coding-agent',
    );
  });

  test('buildSpawnConfig should handle model and extra arguments', () => {
    const resolved = { env: { FALCON_GATEWAY_SLUG: 'openai' } };
    const config = launcher.buildSpawnConfig(resolved, 'gpt-4o', ['--verbose', 'hello']);
    assert.strictEqual(config.command, 'pi');
    assert.deepStrictEqual(config.args, ['--model', 'gpt-4o', '--verbose', 'hello']);
  });

  test('buildSpawnConfig should use custom binary path when configured', () => {
    const resolved = { env: {} };
    const config = launcher.buildSpawnConfig(resolved, '', []);
    assert.strictEqual(config.command, 'pi');
  });

  test('buildSpawnConfig should convert prompt argument to print mode', () => {
    const resolved = { env: { FALCON_GATEWAY_SLUG: 'openai' } };
    const config = launcher.buildSpawnConfig(resolved, 'gpt-4o', [
      '-p',
      'Hello, world!',
      '--verbose',
    ]);
    assert.deepStrictEqual(config.args, ['-p', 'Hello, world!', '--model', 'gpt-4o', '--verbose']);

    const config2 = launcher.buildSpawnConfig(resolved, 'gpt-4o', ['--prompt', 'Test prompt']);
    assert.deepStrictEqual(config2.args, ['-p', 'Test prompt', '--model', 'gpt-4o']);
  });

  test('resolveConfig should set PI_AGENT_DIR and create it', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-pi-test-'));
    const testConfigDir = path.join(tempDir, 'pi');
    process.env[ENV_PI_CONFIG_DIR] = testConfigDir;

    try {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-test',
        },
      };

      const resolved = await launcher.resolveConfig(config, 'openai', 'sk-test', 'gpt-4o');

      assert.strictEqual(resolved.env[ENV_PI_CONFIG_DIR], testConfigDir);
      assert.ok(fs.existsSync(testConfigDir), 'Pi config directory should be created');

      // Verify privacy / telemetry environment variables
      assert.strictEqual(resolved.env['PI_SKIP_VERSION_CHECK'], '1');
      assert.strictEqual(resolved.env['PI_TELEMETRY'], '0');

      // Verify models.json config contains the falcon provider
      const modelsPath = path.join(testConfigDir, 'models.json');
      assert.ok(fs.existsSync(modelsPath), 'models.json file should be created');
      const writtenConfig = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
      assert.ok(writtenConfig.providers.falcon, 'falcon provider should exist');
      assert.strictEqual(writtenConfig.providers.falcon.api, 'openai-completions');
      assert.strictEqual(writtenConfig.providers.falcon.apiKey, '$FALCON_PI_API_KEY');
      assert.deepStrictEqual(writtenConfig.providers.falcon.models, [{ id: 'gpt-4o' }]);
    } finally {
      delete process.env[ENV_PI_CONFIG_DIR];
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('resolveConfig should fallback to FALCON_DIR/pi when PI_AGENT_DIR is not set', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-pi-test-'));
    const originalFalconDir = process.env[ENV_FALCON_DIR];
    const originalConfigDir = process.env[ENV_PI_CONFIG_DIR];

    process.env[ENV_FALCON_DIR] = tempDir;
    delete process.env[ENV_PI_CONFIG_DIR];

    try {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-test',
        },
      };

      const resolved = await launcher.resolveConfig(config, 'openai', 'sk-test', 'gpt-4o');

      const expectedDir = path.join(tempDir, 'pi');
      assert.strictEqual(resolved.env[ENV_PI_CONFIG_DIR], expectedDir);
      assert.ok(fs.existsSync(expectedDir), 'Pi config directory should be created in FALCON_DIR');
    } finally {
      if (originalFalconDir !== undefined) {
        process.env[ENV_FALCON_DIR] = originalFalconDir;
      } else {
        delete process.env[ENV_FALCON_DIR];
      }
      if (originalConfigDir !== undefined) {
        process.env[ENV_PI_CONFIG_DIR] = originalConfigDir;
      } else {
        delete process.env[ENV_PI_CONFIG_DIR];
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('resolveConfig should use anthropic API for anthropic gateway', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-pi-test-'));
    const testConfigDir = path.join(tempDir, 'pi');
    process.env[ENV_PI_CONFIG_DIR] = testConfigDir;

    try {
      const config: GatewayConfig = {
        env: {
          ANTHROPIC_API_KEY: 'sk-ant-test',
        },
      };

      await launcher.resolveConfig(config, 'anthropic', 'sk-ant-test', 'claude-haiku-4-5');

      const modelsPath = path.join(testConfigDir, 'models.json');
      const writtenConfig = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
      assert.strictEqual(writtenConfig.providers.falcon.api, 'anthropic-messages');
    } finally {
      delete process.env[ENV_PI_CONFIG_DIR];
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('resolveConfig should include baseUrl for custom gateways', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-pi-test-'));
    const testConfigDir = path.join(tempDir, 'pi');
    process.env[ENV_PI_CONFIG_DIR] = testConfigDir;

    try {
      const config: GatewayConfig = {
        baseUrl: 'http://localhost:1234/v1',
        env: {},
      };

      await launcher.resolveConfig(config, 'openai-compatible', 'sk-local', 'my-model');

      const modelsPath = path.join(testConfigDir, 'models.json');
      const writtenConfig = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
      assert.strictEqual(writtenConfig.providers.falcon.baseUrl, 'http://localhost:1234/v1');
    } finally {
      delete process.env[ENV_PI_CONFIG_DIR];
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('resolveConfig should merge with existing models.json preserving other providers', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-pi-test-'));
    const testConfigDir = path.join(tempDir, 'pi');
    process.env[ENV_PI_CONFIG_DIR] = testConfigDir;
    fs.mkdirSync(testConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(testConfigDir, 'models.json'),
      JSON.stringify({
        providers: {
          ollama: {
            baseUrl: 'http://localhost:11434/v1',
            api: 'openai-completions',
            apiKey: 'ollama',
            models: [{ id: 'llama3.1:8b' }],
          },
        },
      }),
      'utf8',
    );

    try {
      const config: GatewayConfig = {
        env: {
          OPENAI_API_KEY: 'sk-test',
        },
      };

      await launcher.resolveConfig(config, 'openai', 'sk-test', 'gpt-4o');

      const writtenConfig = JSON.parse(
        fs.readFileSync(path.join(testConfigDir, 'models.json'), 'utf8'),
      );
      // Existing provider preserved
      assert.ok(writtenConfig.providers.ollama, 'existing providers should be preserved');
      // Falcon provider added
      assert.ok(writtenConfig.providers.falcon, 'falcon provider should be added');
    } finally {
      delete process.env[ENV_PI_CONFIG_DIR];
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('resolveConfig should set privacy and telemetry env vars', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-pi-test-'));
    const testConfigDir = path.join(tempDir, 'pi');
    process.env[ENV_PI_CONFIG_DIR] = testConfigDir;

    try {
      const config: GatewayConfig = { env: {} };
      const resolved = await launcher.resolveConfig(config, 'openai', 'sk-test', '');

      assert.strictEqual(resolved.env['PI_SKIP_VERSION_CHECK'], '1');
      assert.strictEqual(resolved.env['PI_TELEMETRY'], '0');
      assert.strictEqual(resolved.env['FALCON_GATEWAY_SLUG'], 'openai');
      // No model provided: no API key injected
      assert.strictEqual(resolved.env['FALCON_PI_API_KEY'], undefined);
    } finally {
      delete process.env[ENV_PI_CONFIG_DIR];
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  test('resolveConfig should not write models.json when no model is given', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-pi-test-'));
    const testConfigDir = path.join(tempDir, 'pi');
    process.env[ENV_PI_CONFIG_DIR] = testConfigDir;

    try {
      const config: GatewayConfig = { env: {} };
      await launcher.resolveConfig(config, 'openai', 'sk-test', '');

      assert.strictEqual(
        fs.existsSync(path.join(testConfigDir, 'models.json')),
        false,
        'models.json should not be created without a model',
      );
    } finally {
      delete process.env[ENV_PI_CONFIG_DIR];
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });
});
