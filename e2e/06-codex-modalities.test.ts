/**
 * e2e/06-codex-modalities.test.ts
 *
 * E2E test to verify that Codex model catalog generation filters out
 * unsupported modalities (video, audio, etc.) in a launch scenario.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { assertExitCode, makeTempDir, spawnCli } from './helpers.js';

describe('Codex Modalities Filtering E2E', () => {
  it('should filter out unsupported modalities like video and audio when launching codex', () => {
    const tempDir = makeTempDir('falcon-e2e-modalities-');
    const mockBinPath = path.join(tempDir, 'mock-codex-bin');

    // Write an executable mock binary that behaves like Codex
    fs.writeFileSync(mockBinPath, '#!/bin/sh\necho "mock-codex run args: $@"', { mode: 0o755 });

    // Write config.json containing the custom path for codex
    const configPath = path.join(tempDir, 'config.json');
    const configData = {
      version: 2,
      gateways: [],
      binPaths: {
        codex: mockBinPath,
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');

    // Write a mock OpenRouter metadata cache with unsupported modalities
    const cachePath = path.join(tempDir, 'openrouter-models.json');
    const cacheData = {
      version: 1,
      fetchedAt: Date.now(),
      models: {
        'google/gemma-4-31b-it:free': {
          contextLength: 1000000,
          modalities: ['text', 'image', 'audio', 'video'],
          pricing: {
            prompt: '$0.00/1M',
            completion: '$0.00/1M',
            promptPerM: 0,
          },
        },
      },
    };
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');

    const codexHome = path.join(tempDir, 'codex-home');

    // Run launcher with mock configs and keys
    const env = {
      PATH: '/usr/bin:/bin',
      FALCON_DIR: tempDir,
      FALCON_CONFIG_FILE: configPath,
      FALCON_MODEL_METADATA_CACHE_PATH: cachePath,
      OPENROUTER_API_KEY: 'sk-or-mock-key-for-modalities-test',
      CODEX_HOME: codexHome,
    };

    const r = spawnCli(
      ['launch', 'codex', '-g', 'openrouter', '-m', 'google/gemma-4-31b-it:free'],
      {
        env,
      },
    );

    // Verify exit code is 0
    assertExitCode(r, 0);

    // Check that model.json was created inside codexHome
    const catalogPath = path.join(codexHome, 'model.json');
    assert.ok(fs.existsSync(catalogPath), 'model.json should have been written to CODEX_HOME');

    // Read and parse model.json to verify modalities are cleaned
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const gemmaEntry = catalog.models?.find(
      (m: { slug: string }) => m.slug === 'google/gemma-4-31b-it:free',
    );

    assert.ok(gemmaEntry, 'model.json should contain an entry for google/gemma-4-31b-it:free');
    assert.deepStrictEqual(
      gemmaEntry.input_modalities,
      ['text', 'image'],
      'input_modalities should only contain text and image',
    );

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
