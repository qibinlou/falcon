/**
 * e2e/01-cli-contract.test.ts
 *
 * Tests the CLI surface contract: --help, --version, missing args, unknown agents.
 * These tests require NO API keys and always run.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertContains,
  assertNotContains,
  assertExitCode,
  spawnCli,
  makeTempDir,
} from './helpers.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('CLI Contract', () => {
  it('--help exits 0 and lists core commands', () => {
    const r = spawnCli(['--help']);
    assertExitCode(r, 0);
    assertContains(r.stdout, 'launch', '--help stdout');
    assertContains(r.stdout, 'models', '--help stdout');
    assertContains(r.stdout, 'falcon', '--help stdout');
  });

  it('--version exits 0 and prints a version string', () => {
    const r = spawnCli(['--version']);
    assertExitCode(r, 0);
    // Version should look like "0.1.0" or similar semver
    assert.match(r.stdout.trim(), /\d+\.\d+\.\d+/, '--version should print semver');
  });

  it('launch with no agent lists available agents and exits 0', () => {
    const r = spawnCli(['launch']);
    assertExitCode(r, 0);
    // Should list known agents
    assertContains(r.stdout + r.stderr, 'codex', 'launch (no agent)');
    assertContains(r.stdout + r.stderr, 'claude', 'launch (no agent)');
    assertContains(r.stdout + r.stderr, 'opencode', 'launch (no agent)');
    assertNotContains(r.stdout + r.stderr, 'agy', 'launch (no agent)');
  });

  it('launch with unknown agent exits 1 and reports error', () => {
    const r = spawnCli(['launch', 'notanagent']);
    assertExitCode(r, 1);
    const combined = r.stdout + r.stderr;
    assertContains(combined, 'notanagent', 'unknown agent error');
  });

  it('launch help subcommand exits 0', () => {
    const r = spawnCli(['launch', '--help']);
    assertExitCode(r, 0);
    assertContains(r.stdout, '--model', 'launch --help');
    assertContains(r.stdout, '--gateway', 'launch --help');
  });

  it('launch agent with --help displays agent help instead of launch help', () => {
    const tempDir = makeTempDir('falcon-e2e-contract-');
    const mockBinPath = path.join(tempDir, 'mock-opencode-bin');
    fs.writeFileSync(mockBinPath, '#!/bin/sh\necho "mock-opencode-run args: $@"', { mode: 0o755 });

    const configPath = path.join(tempDir, 'config.json');
    const configData = {
      version: 2,
      gateways: [],
      binPaths: {
        opencode: mockBinPath,
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');

    const env = {
      PATH: '/usr/bin:/bin',
      FALCON_DIR: tempDir,
      FALCON_CONFIG_FILE: configPath,
    };

    const r = spawnCli(['launch', 'opencode', '--help'], { env });
    assertExitCode(r, 0);
    assertContains(r.stdout, 'mock-opencode-run args:', 'should execute mock binary');
    assertContains(r.stdout, '--help', 'should pass --help to agent');
    assertNotContains(
      r.stdout,
      'Agent to launch (codex, claude, opencode)',
      'should not show launch help',
    );

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('launch agent with -h displays agent help instead of launch help', () => {
    const tempDir = makeTempDir('falcon-e2e-contract-');
    const mockBinPath = path.join(tempDir, 'mock-opencode-bin');
    fs.writeFileSync(mockBinPath, '#!/bin/sh\necho "mock-opencode-run args: $@"', { mode: 0o755 });

    const configPath = path.join(tempDir, 'config.json');
    const configData = {
      version: 2,
      gateways: [],
      binPaths: {
        opencode: mockBinPath,
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');

    const env = {
      PATH: '/usr/bin:/bin',
      FALCON_DIR: tempDir,
      FALCON_CONFIG_FILE: configPath,
    };

    const r = spawnCli(['launch', 'opencode', '-h'], { env });
    assertExitCode(r, 0);
    assertContains(r.stdout, 'mock-opencode-run args:', 'should execute mock binary');
    assertContains(r.stdout, '-h', 'should pass -h to agent');
    assertNotContains(
      r.stdout,
      'Agent to launch (codex, claude, opencode)',
      'should not show launch help',
    );

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('launch agent with any commands/options directly forwards them to agent cli', () => {
    const tempDir = makeTempDir('falcon-e2e-contract-');
    const mockBinPath = path.join(tempDir, 'mock-agent-bin');
    fs.writeFileSync(mockBinPath, '#!/bin/sh\necho "mock-agent-run args: $@"', { mode: 0o755 });

    const configPath = path.join(tempDir, 'config.json');
    const configData = {
      version: 2,
      gateways: [],
      binPaths: {
        opencode: mockBinPath,
        claude: mockBinPath,
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');

    const env = {
      PATH: '/usr/bin:/bin',
      FALCON_DIR: tempDir,
      FALCON_CONFIG_FILE: configPath,
    };

    // Test with opencode status subcommand
    const r1 = spawnCli(['launch', 'opencode', 'auth', 'status'], { env });
    assertExitCode(r1, 0);
    assertContains(r1.stdout, 'mock-agent-run args:', 'should execute mock binary');
    assertContains(r1.stdout, 'auth status', 'should pass auth status command to agent');

    // Test with top-level agent command (falcon opencode auth status)
    const r2 = spawnCli(['opencode', 'auth', 'status'], { env });
    assertExitCode(r2, 0);
    assertContains(r2.stdout, 'mock-agent-run args:', 'should execute mock binary');
    assertContains(r2.stdout, 'auth status', 'should pass auth status command to agent');

    // Test with claude auth status subcommand
    const r3 = spawnCli(['launch', 'claude', 'auth', 'status'], { env });
    assertExitCode(r3, 0);
    assertContains(r3.stdout, 'mock-agent-run args:', 'should execute mock binary');
    assertContains(r3.stdout, 'auth status', 'should pass auth status command to agent');

    // Test with top-level claude command (falcon claude auth status)
    const r4 = spawnCli(['claude', 'auth', 'status'], { env });
    assertExitCode(r4, 0);
    assertContains(r4.stdout, 'mock-agent-run args:', 'should execute mock binary');
    assertContains(r4.stdout, 'auth status', 'should pass auth status command to agent');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('models --help exits 0 and mentions gateway option', () => {
    const r = spawnCli(['models', '--help']);
    assertExitCode(r, 0);
    assertContains(r.stdout, '--gateway', 'models --help');
  });

  it('unknown top-level command exits non-zero', () => {
    const r = spawnCli(['definitely-not-a-command']);
    assert.notEqual(r.exitCode, 0, 'unknown command should exit non-zero');
  });
});
