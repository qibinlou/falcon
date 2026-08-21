/**
 * e2e/08-pi-agent.test.ts
 *
 * End-to-end tests for the Pi agent integration.
 * Uses a mock `pi` binary (via FALCON_CONFIG_FILE binPaths) and an isolated
 * PI_AGENT_DIR to verify that Falcon configures pi's models.json correctly
 * and forwards model/prompt arguments. Requires NO API keys and always runs.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { assertContains, assertExitCode, makeTempDir, spawnCli } from './helpers.js';

/** Sets up an isolated environment with a mock `pi` binary. */
function setupMockPi(): { tempDir: string; env: Record<string, string>; piConfigDir: string } {
  const tempDir = makeTempDir('falcon-e2e-pi-');
  const mockBinPath = path.join(tempDir, 'mock-pi-bin');
  fs.writeFileSync(
    mockBinPath,
    '#!/bin/sh\necho "mock-pi-run args: $@"\necho "FALCON_PI_API_KEY=$FALCON_PI_API_KEY"\necho "PI_AGENT_DIR=$PI_AGENT_DIR"',
    { mode: 0o755 },
  );

  const configPath = path.join(tempDir, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({ version: 2, gateways: [], binPaths: { pi: mockBinPath } }, null, 2),
    'utf8',
  );

  const piConfigDir = path.join(tempDir, 'pi-config');
  const env = {
    PATH: '/usr/bin:/bin',
    FALCON_DIR: tempDir,
    FALCON_CONFIG_FILE: configPath,
    PI_AGENT_DIR: piConfigDir,
    OPENAI_API_KEY: 'sk-e2e-test-key',
  };

  return { tempDir, env, piConfigDir };
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

describe('Pi Agent E2E', () => {
  it('launch pi is listed as an available agent', () => {
    const r = spawnCli(['launch']);
    assertExitCode(r, 0);
    assertContains(r.stdout + r.stderr, 'pi', 'launch (no agent) should list pi');
  });

  it('launch pi -m <model> writes models.json and launches mock binary with --model', () => {
    const { tempDir, env, piConfigDir } = setupMockPi();

    try {
      const r = spawnCli(['launch', 'pi', '-g', 'openai', '-m', 'gpt-4o'], { env });
      assertExitCode(r, 0);

      // Mock binary should have been executed with the model flag
      assertContains(r.stdout, 'mock-pi-run args:', 'mock pi binary output');
      assertContains(r.stdout, '--model gpt-4o', 'model flag forwarded');

      // API key should be injected via env interpolation variable
      assertContains(r.stdout, 'FALCON_PI_API_KEY=sk-e2e-test-key', 'api key injected');

      // Config dir should be passed through
      assertContains(r.stdout, `PI_AGENT_DIR=${piConfigDir}`, 'config dir set');

      // models.json should be written with the falcon provider
      const modelsPath = path.join(piConfigDir, 'models.json');
      assert.ok(fs.existsSync(modelsPath), 'models.json should be created');
      const written = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
      assert.ok(written.providers.falcon, 'falcon provider registered');
      assert.strictEqual(written.providers.falcon.api, 'openai-completions');
      assert.strictEqual(written.providers.falcon.apiKey, '$FALCON_PI_API_KEY');
      assert.deepStrictEqual(written.providers.falcon.models, [{ id: 'gpt-4o' }]);
      // Raw key must never be persisted
      assert.ok(!JSON.stringify(written).includes('sk-e2e-test-key'), 'raw key not on disk');
    } finally {
      cleanup(tempDir);
    }
  });

  it('launch pi uses anthropic-messages api for anthropic gateway', () => {
    const { tempDir, env, piConfigDir } = setupMockPi();

    try {
      const r = spawnCli(['launch', 'pi', '-g', 'anthropic', '-m', 'claude-haiku-4-5'], {
        env: { ...env, OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: 'sk-ant-e2e-test' },
      });
      assertExitCode(r, 0);

      const written = JSON.parse(fs.readFileSync(path.join(piConfigDir, 'models.json'), 'utf8'));
      assert.strictEqual(written.providers.falcon.api, 'anthropic-messages');
      assert.deepStrictEqual(written.providers.falcon.models, [{ id: 'claude-haiku-4-5' }]);
    } finally {
      cleanup(tempDir);
    }
  });

  it('launch pi converts -p prompt flag to print mode args', () => {
    const { tempDir, env } = setupMockPi();

    try {
      const r = spawnCli(['launch', 'pi', '-g', 'openai', '-m', 'gpt-4o', '-p', 'hello world'], {
        env,
      });
      assertExitCode(r, 0);
      assertContains(r.stdout, '-p hello world', 'prompt converted to print mode');
      assertContains(r.stdout, '--model gpt-4o', 'model flag forwarded');
    } finally {
      cleanup(tempDir);
    }
  });

  it('launch pi without a model never writes models.json', () => {
    const { tempDir, env, piConfigDir } = setupMockPi();

    try {
      // Without -m, Falcon enters the interactive model picker which cannot
      // run headless — it should fail gracefully without writing any config.
      const r = spawnCli(['launch', 'pi', '-g', 'openai'], { env });
      assert.notStrictEqual(r.exitCode, undefined, 'process should terminate');
      assert.equal(
        fs.existsSync(path.join(piConfigDir, 'models.json')),
        false,
        'models.json should not exist without an explicit model',
      );
    } finally {
      cleanup(tempDir);
    }
  });

  it('pi shorthand command launches the agent', () => {
    const { tempDir, env } = setupMockPi();

    try {
      const r = spawnCli(['pi', '-g', 'openai', '-m', 'gpt-4o'], { env });
      assertExitCode(r, 0);
      assertContains(r.stdout, 'mock-pi-run args:', 'mock pi binary output');
      assertContains(r.stdout, '--model gpt-4o', 'model flag forwarded');
    } finally {
      cleanup(tempDir);
    }
  });
});
