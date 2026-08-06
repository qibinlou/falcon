/**
 * e2e/07-codex-app-multi-model.test.ts
 *
 * E2E test to verify that the Codex Desktop App (codex-app) launcher writes
 * a native-shaped model catalog and cache, with the selected model first.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { assertExitCode, makeTempDir, spawnCli } from './helpers.js';

describe('Codex Desktop App Multi-Model E2E', () => {
  it('should refresh the native model catalog and keep the selected model first', () => {
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

    // Run once to initialize the isolated desktop configuration.
    const envBase = {
      PATH: '/usr/bin:/bin',
      FALCON_DIR: tempDir,
      FALCON_CONFIG_FILE: configPath,
      OPENROUTER_API_KEY: 'sk-or-mock-key-for-e2e-app-test',
      CHATGPT_DESKTOP_PATH: mockBinPath,
      CODEX_DESKTOP_PATH: mockBinPath,
      FALCON_CODEX_APP_CHATGPT_AUTH_PATH: path.join(tempDir, 'missing-primary-auth.json'),
    };

    const r1 = spawnCli(['launch', 'codex-app', '-g', 'openrouter', '-m', 'openrouter/model-1'], {
      env: envBase,
    });
    assertExitCode(r1, 0);

    // Run again with a different selection. When live discovery succeeds this
    // refreshes the gateway catalog; offline it safely retains prior rows.
    const r2 = spawnCli(['launch', 'codex-app', '-g', 'openrouter', '-m', 'openrouter/model-2'], {
      env: envBase,
    });
    assertExitCode(r2, 0);

    // Check that model.json was created inside falconDir/codex-app
    const codexAppDir = path.join(tempDir, 'codex-app');
    const catalogPath = path.join(codexAppDir, 'model.json');
    assert.ok(fs.existsSync(catalogPath), 'model.json should have been written to codex-app dir');

    // The selected model must be first because Codex Desktop currently asks
    // app-server for only the first 100 catalog entries.
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const slugs = catalog.models?.map((m: { slug: string }) => m.slug) || [];

    assert.strictEqual(slugs[0], 'openrouter/model-2');
    assert.strictEqual(catalog.models[0].priority, 0);
    assert.strictEqual(catalog.models[0].shell_type, 'shell_command');
    assert.strictEqual(catalog.models[0].visibility, 'list');

    const cachePath = path.join(codexAppDir, 'models_cache.json');
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.strictEqual(cache.fetched_at, '2000-01-01T00:00:00Z');
    assert.deepStrictEqual(cache.models, catalog.models);

    // Verify config.toml updated the active model to the latest launch model
    const configTomlPath = path.join(codexAppDir, 'config.toml');
    assert.ok(fs.existsSync(configTomlPath), 'config.toml should exist');
    const configContent = fs.readFileSync(configTomlPath, 'utf8');
    assert.ok(
      configContent.includes('model = "openrouter/model-2"'),
      'config.toml should have selected model-2',
    );
    assert.ok(configContent.includes('env_key = "OPENAI_API_KEY"'));
    assert.ok(configContent.includes('requires_openai_auth = true'));

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
