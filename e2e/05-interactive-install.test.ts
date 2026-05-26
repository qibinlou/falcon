/**
 * e2e/05-interactive-install.test.ts
 *
 * Tests the interactive installation prompt when agent binary is missing,
 * option selection, and verification of custom path overrides.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { assertContains, assertExitCode, makeTempDir, spawnCli } from './helpers.ts';

describe('Interactive Agent Installation E2E', () => {
  it('should trigger install prompt for claude when not in PATH and copy command on select "3"', () => {
    // Restricted PATH to hide local binaries
    const env = {
      PATH: '/usr/bin:/bin',
    };
    const r = spawnCli(['launch', 'claude'], { env, input: '3' });

    // Check exit code
    assertExitCode(r, 0);

    // Verify it printed the warning and the install command
    const output = r.stdout + r.stderr;
    assertContains(output, 'CLI binary is not installed');
    assertContains(output, 'curl -fsSL https://claude.ai/install.sh | bash');
  });

  it('should trigger install prompt for codex when not in PATH and copy command on select "3"', () => {
    const env = {
      PATH: '/usr/bin:/bin',
    };
    const r = spawnCli(['launch', 'codex'], { env, input: '3' });

    assertExitCode(r, 0);

    const output = r.stdout + r.stderr;
    assertContains(output, 'CLI binary is not installed');
    assertContains(output, 'npm install -g @openai/codex');
  });

  it('should skip install prompt when valid custom binary path is configured', () => {
    // Create a temporary directory for config and mock binary
    const tempDir = makeTempDir('falcon-e2e-install-');
    const mockBinPath = path.join(tempDir, 'mock-claude-bin');

    // Write an executable mock binary
    fs.writeFileSync(mockBinPath, '#!/bin/sh\necho "mocked claude run"', { mode: 0o755 });

    // Write config.json containing the custom path (unencrypted)
    const configPath = path.join(tempDir, 'config.json');
    const configData = {
      version: 2,
      gateways: [],
      binPaths: {
        claude: mockBinPath,
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');

    // Run launcher with mock config directory, restricted PATH
    const env = {
      PATH: '/usr/bin:/bin',
      FALCON_DIR: tempDir,
      FALCON_CONFIG_FILE: configPath,
    };

    // It should skip the install prompt and transition to gateway configuration/detection
    const r = spawnCli(['launch', 'claude'], { env, input: '\u001b' });

    const output = r.stdout + r.stderr;

    // It should NOT contain the install warning
    assert.ok(
      !output.includes('CLI binary is not installed or discovered'),
      'Should skip install prompt when custom bin is configured',
    );

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
