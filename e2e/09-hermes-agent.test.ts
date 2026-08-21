/**
 * End-to-end tests for the Hermes Agent integration.
 * Uses a mock `hermes` binary and isolated Hermes state; no API keys or network
 * access are required.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { assertContains, assertExitCode, makeTempDir, spawnCli } from './helpers.js';

function setupMockHermes(): {
  tempDir: string;
  env: Record<string, string>;
  hermesHome: string;
} {
  const tempDir = makeTempDir('falcon-e2e-hermes-');
  const mockBinPath = path.join(tempDir, 'mock-hermes-bin');
  fs.writeFileSync(
    mockBinPath,
    [
      '#!/bin/sh',
      'echo "mock-hermes-run args: $@"',
      'echo "FALCON_HERMES_PROVIDER=$FALCON_HERMES_PROVIDER"',
      'echo "OPENROUTER_API_KEY=$OPENROUTER_API_KEY"',
      'echo "HERMES_HOME=$HERMES_HOME"',
    ].join('\n'),
    { mode: 0o755 },
  );

  const configPath = path.join(tempDir, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({ version: 2, gateways: [], binPaths: { hermes: mockBinPath } }, null, 2),
    'utf8',
  );

  const hermesHome = path.join(tempDir, 'hermes-home');
  return {
    tempDir,
    hermesHome,
    env: {
      PATH: '/usr/bin:/bin',
      FALCON_DIR: tempDir,
      FALCON_CONFIG_FILE: configPath,
      HERMES_HOME: hermesHome,
      OPENROUTER_API_KEY: 'sk-hermes-e2e',
    },
  };
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('Hermes Agent E2E', () => {
  it('launch hermes is listed as an available agent', () => {
    const r = spawnCli(['launch']);
    assertExitCode(r, 0);
    assertContains(r.stdout + r.stderr, 'hermes', 'launch (no agent) should list hermes');
  });

  it('launch hermes configures provider, home, model, and prompt', () => {
    const { tempDir, env, hermesHome } = setupMockHermes();
    try {
      const r = spawnCli(
        [
          'launch',
          'hermes',
          '-g',
          'openrouter',
          '-m',
          'openrouter/test-model',
          '-p',
          'hello Hermes',
        ],
        { env },
      );
      assertExitCode(r, 0);
      assertContains(r.stdout, 'mock-hermes-run args:', 'mock hermes binary output');
      assertContains(
        r.stdout,
        'chat --provider openrouter --model openrouter/test-model -q hello Hermes',
      );
      assertContains(r.stdout, 'FALCON_HERMES_PROVIDER=openrouter');
      assertContains(r.stdout, 'OPENROUTER_API_KEY=sk-hermes-e2e');
      assertContains(r.stdout, `HERMES_HOME=${hermesHome}`);
      assert.ok(fs.existsSync(hermesHome), 'Hermes home should be created');
    } finally {
      cleanup(tempDir);
    }
  });

  it('hermes shorthand command launches the agent', () => {
    const { tempDir, env } = setupMockHermes();
    try {
      const r = spawnCli(['hermes', '-g', 'openrouter', '-m', 'test-model'], { env });
      assertExitCode(r, 0);
      assertContains(r.stdout, 'mock-hermes-run args:', 'mock hermes binary output');
      assertContains(r.stdout, 'chat --provider openrouter --model test-model');
    } finally {
      cleanup(tempDir);
    }
  });
});
