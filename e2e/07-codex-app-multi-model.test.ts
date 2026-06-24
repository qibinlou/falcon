/**
 * e2e/07-codex-app-multi-model.test.ts
 *
 * E2E test to verify that the Codex Desktop App (codex-app) launcher writes
 * multiple custom models to model.json, and retrieves/includes all of them
 * when launching the app.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { assertExitCode, makeTempDir, spawnCli } from './helpers.js';

describe('Codex Desktop App Multi-Model E2E', () => {
  it('should accumulate multiple models in model.json and read them during launch', () => {
    const tempDir = makeTempDir('falcon-e2e-codex-app-');
    const mockBinPath = path.join(tempDir, 'mock-codex-desktop');

    // Write an executable mock binary that behaves like Codex Desktop app (just exits)
    fs.writeFileSync(mockBinPath, '#!/bin/sh\necho "mock-codex-desktop run args: $@"\nexit 0', {
      mode: 0o755,
    });

    // Write config.json containing custom binPaths if needed (not strictly required for desktop app since it uses CODEX_DESKTOP_PATH)
    const configPath = path.join(tempDir, 'config.json');
    const configData = {
      version: 2,
      gateways: [],
      binPaths: {},
    };
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');

    // Run first model launch to register model-1 in catalog
    const envBase = {
      PATH: '/usr/bin:/bin',
      FALCON_DIR: tempDir,
      FALCON_CONFIG_FILE: configPath,
      OPENROUTER_API_KEY: 'sk-or-mock-key-for-e2e-app-test',
      CODEX_DESKTOP_PATH: mockBinPath,
    };

    const r1 = spawnCli(['launch', 'codex-app', '-g', 'openrouter', '-m', 'openrouter/model-1'], {
      env: envBase,
    });
    assertExitCode(r1, 0);

    // Run second model launch to register model-2 and trigger the full launch using catalog slugs
    const r2 = spawnCli(['launch', 'codex-app', '-g', 'openrouter', '-m', 'openrouter/model-2'], {
      env: envBase,
    });
    assertExitCode(r2, 0);

    // Check that model.json was created inside falconDir/codex-app
    const codexAppDir = path.join(tempDir, 'codex-app');
    const catalogPath = path.join(codexAppDir, 'model.json');
    assert.ok(fs.existsSync(catalogPath), 'model.json should have been written to codex-app dir');

    // Read and parse model.json to verify multiple models accumulated
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const slugs = catalog.models?.map((m: { slug: string }) => m.slug) || [];

    assert.ok(slugs.includes('openrouter/model-1'), 'catalog should contain openrouter/model-1');
    assert.ok(slugs.includes('openrouter/model-2'), 'catalog should contain openrouter/model-2');

    // Verify config.toml updated the active model to the latest launch model
    const configTomlPath = path.join(codexAppDir, 'config.toml');
    assert.ok(fs.existsSync(configTomlPath), 'config.toml should exist');
    const configContent = fs.readFileSync(configTomlPath, 'utf8');
    assert.ok(
      configContent.includes('model = "openrouter/model-2"'),
      'config.toml should have selected model-2',
    );

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
