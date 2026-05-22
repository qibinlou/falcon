/**
 * e2e/01-cli-contract.test.ts
 *
 * Tests the CLI surface contract: --help, --version, missing args, unknown agents.
 * These tests require NO API keys and always run.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertContains, assertExitCode, spawnCli } from './helpers.ts';

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
    assertContains(r.stdout, '--dry-run', 'launch --help');
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
