import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { ENV_FALCON_DIR, ENV_HERMES_HOME } from '../constants.js';
import type { GatewayConfig } from '../gateways/index.js';
import { HermesLauncher } from './hermes.js';

describe('Hermes Agent Launcher', () => {
  const launcher = new HermesLauncher();

  test('should have correct details and install command', () => {
    assert.equal(launcher.name, 'Hermes');
    assert.equal(launcher.slug, 'hermes');
    assert.equal(launcher.binaryName, 'hermes');
    assert.equal(
      launcher.installCommand,
      'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
    );
  });

  test('should map provider credentials to their scoped Hermes environment variables', async () => {
    const cases: Array<{
      slug: string;
      config: GatewayConfig;
      provider: string;
      key: string;
      baseUrl?: string;
    }> = [
      {
        slug: 'openrouter',
        config: { env: {}, baseUrl: 'https://openrouter.ai/api/v1' },
        provider: 'openrouter',
        key: 'OPENROUTER_API_KEY',
      },
      {
        slug: 'openrouter',
        config: { env: {}, baseUrl: 'https://openrouter.example/v1' },
        provider: 'openrouter',
        key: 'OPENROUTER_API_KEY',
        baseUrl: 'https://openrouter.example/v1',
      },
      {
        slug: 'anthropic',
        config: { env: {}, baseUrl: 'https://api.anthropic.com' },
        provider: 'anthropic',
        key: 'ANTHROPIC_API_KEY',
      },
      {
        slug: 'openai',
        config: { env: {}, baseUrl: 'https://api.openai.com/v1' },
        provider: 'openai-api',
        key: 'OPENAI_API_KEY',
      },
      {
        slug: 'openai-compatible',
        config: { env: {}, baseUrl: 'http://localhost:1234/v1' },
        provider: 'custom',
        key: 'OPENAI_API_KEY',
        baseUrl: 'http://localhost:1234/v1',
      },
      {
        slug: 'cloudflare',
        config: { env: {}, baseUrl: 'https://gateway.ai.cloudflare.com/v1/account/gateway' },
        provider: 'custom',
        key: 'OPENAI_API_KEY',
        baseUrl: 'https://gateway.ai.cloudflare.com/v1/account/gateway',
      },
    ];

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-hermes-test-'));
    process.env[ENV_HERMES_HOME] = path.join(tempDir, 'hermes');

    try {
      for (const testCase of cases) {
        const resolved = await launcher.resolveConfig(
          testCase.config,
          testCase.slug,
          'sk-test-key',
          'test-model',
        );
        assert.equal(resolved.env.FALCON_HERMES_PROVIDER, testCase.provider);
        assert.equal(resolved.env[testCase.key], 'sk-test-key');
        assert.equal(resolved.env.FALCON_GATEWAY_SLUG, testCase.slug);
        assert.equal(resolved.env[ENV_HERMES_HOME], path.join(tempDir, 'hermes'));
        if (testCase.baseUrl) {
          assert.equal(
            resolved.env.OPENAI_BASE_URL ?? resolved.env.OPENROUTER_BASE_URL,
            testCase.baseUrl,
          );
        } else {
          assert.equal(resolved.env.OPENROUTER_BASE_URL, undefined);
        }
      }
      assert.ok(fs.existsSync(path.join(tempDir, 'hermes')));
    } finally {
      delete process.env[ENV_HERMES_HOME];
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should use FALCON_DIR/hermes by default and preserve existing environment', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-hermes-test-'));
    const originalFalconDir = process.env[ENV_FALCON_DIR];
    delete process.env[ENV_HERMES_HOME];
    process.env[ENV_FALCON_DIR] = tempDir;

    try {
      const resolved = await launcher.resolveConfig(
        { env: { EXISTING_FLAG: 'preserved' } },
        'openai',
        'sk-test-key',
        'test-model',
      );
      assert.equal(resolved.env[ENV_HERMES_HOME], path.join(tempDir, 'hermes'));
      assert.equal(resolved.env.EXISTING_FLAG, 'preserved');
      assert.equal(fs.statSync(path.join(tempDir, 'hermes')).mode & 0o777, 0o700);
    } finally {
      if (originalFalconDir === undefined) delete process.env[ENV_FALCON_DIR];
      else process.env[ENV_FALCON_DIR] = originalFalconDir;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should convert Falcon prompt flags to hermes chat query flags', () => {
    const resolved = { env: { FALCON_HERMES_PROVIDER: 'openrouter' } };
    const config = launcher.buildSpawnConfig(resolved, 'test-model', [
      '--prompt',
      'hello world',
      '--verbose',
      '--json',
    ]);
    assert.equal(config.command, 'hermes');
    assert.deepEqual(config.args, [
      'chat',
      '--provider',
      'openrouter',
      '--model',
      'test-model',
      '-q',
      'hello world',
      '--verbose',
      '--json',
    ]);
  });

  test('should use chat with provider and model without a prompt', () => {
    const resolved = { env: { FALCON_HERMES_PROVIDER: 'custom' } };
    const config = launcher.buildSpawnConfig(resolved, '', ['--verbose']);
    assert.deepEqual(config.args, ['chat', '--provider', 'custom', '--verbose']);
  });

  test('should use a configured custom binary path', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-hermes-test-'));
    const configPath = path.join(tempDir, 'config.json');
    const originalConfig = process.env.FALCON_CONFIG_FILE;
    fs.writeFileSync(
      configPath,
      JSON.stringify({ version: 2, gateways: [], binPaths: { hermes: '/custom/hermes' } }),
    );
    process.env.FALCON_CONFIG_FILE = configPath;

    try {
      const config = launcher.buildSpawnConfig(
        { env: { FALCON_HERMES_PROVIDER: 'openrouter' } },
        'test-model',
        [],
      );
      assert.equal(config.command, '/custom/hermes');
    } finally {
      if (originalConfig === undefined) delete process.env.FALCON_CONFIG_FILE;
      else process.env.FALCON_CONFIG_FILE = originalConfig;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
