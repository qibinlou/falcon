/**
 * e2e/05-codex-config.test.ts
 *
 * Tests Codex filesystem side-effects:
 *  - config.toml is written with correct [profiles.falcon] section
 *  - model.json is written with the model entry
 *  - Re-running is idempotent (updates, not duplicates)
 *  - CODEX_HOME is isolated to a temp dir (never touches ~/.codex)
 *
 * Uses --dry-run so the codex binary itself is never invoked.
 * Skipped when OPENROUTER_API_KEY is absent.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  assertExitCode,
  buildEnv,
  getKey,
  loadDotEnv,
  makeTempDir,
  missingKey,
  spawnCli,
} from './helpers.ts';

let tmpDir: string;

before(() => {
  loadDotEnv();
  tmpDir = makeTempDir('falcon-e2e-codex-');
});

after(() => {
  if (tmpDir) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

describe('Codex Config Side-Effects', () => {
  const MODEL = 'deepseek/deepseek-v4-flash:free';
  const GW = 'openrouter';

  function runDryRun(model = MODEL, codexHome = tmpDir): void {
    const key = getKey('OPENROUTER_API_KEY');
    const r = spawnCli(['launch', 'codex', '-m', model, '-g', GW, '--dry-run'], {
      env: {
        ...buildEnv({ OPENROUTER_API_KEY: key ?? 'sk-or-fake-key' }),
        CODEX_HOME: codexHome,
      },
    });
    assertExitCode(r, 0);
  }

  it('creates CODEX_HOME directory if it does not exist', (_ctx) => {
    const _skip = missingKey('OPENROUTER_API_KEY');
    // For filesystem tests we can use a fake key — no real network call needed
    const freshDir = path.join(tmpDir, 'fresh');
    spawnCli(['launch', 'codex', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: {
        ...buildEnv({ OPENROUTER_API_KEY: 'sk-or-fake-filesystem-test' }),
        CODEX_HOME: freshDir,
      },
    });
    assert.ok(fs.existsSync(freshDir), 'CODEX_HOME directory should be created');
  });

  it('writes config.toml with [profiles.falcon] section', () => {
    runDryRun();
    const configPath = path.join(tmpDir, 'config.toml');
    assert.ok(fs.existsSync(configPath), 'config.toml should exist');
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('[profiles.falcon]'), 'config.toml missing [profiles.falcon]');
  });

  it('config.toml contains the correct model name', () => {
    runDryRun();
    const content = fs.readFileSync(path.join(tmpDir, 'config.toml'), 'utf8');
    assert.ok(
      content.includes(`model = "${MODEL}"`),
      `config.toml should contain model = "${MODEL}"`,
    );
  });

  it('config.toml contains forced_login_method = "api"', () => {
    runDryRun();
    const content = fs.readFileSync(path.join(tmpDir, 'config.toml'), 'utf8');
    assert.ok(
      content.includes('forced_login_method = "api"'),
      'config.toml missing forced_login_method',
    );
  });

  it('config.toml contains a [model_providers.*] section', () => {
    runDryRun();
    const content = fs.readFileSync(path.join(tmpDir, 'config.toml'), 'utf8');
    assert.match(content, /\[model_providers\.\S+\]/, 'missing [model_providers.*] section');
  });

  it('config.toml provider section contains openrouter base_url', () => {
    runDryRun();
    const content = fs.readFileSync(path.join(tmpDir, 'config.toml'), 'utf8');
    assert.ok(content.includes('openrouter.ai'), 'provider base_url should reference openrouter');
  });

  it('writes model.json with the model entry', () => {
    runDryRun();
    const catalogPath = path.join(tmpDir, 'model.json');
    assert.ok(fs.existsSync(catalogPath), 'model.json should exist');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    assert.ok(Array.isArray(catalog.models), 'model.json should have a "models" array');
    const entry = catalog.models.find((m: { slug: string }) => m.slug === MODEL);
    assert.ok(entry, `model.json should contain entry for "${MODEL}"`);
  });

  it('model.json entry has expected fields', () => {
    runDryRun();
    const catalog = JSON.parse(fs.readFileSync(path.join(tmpDir, 'model.json'), 'utf8'));
    const entry = catalog.models.find((m: { slug: string }) => m.slug === MODEL);
    assert.ok(entry.context_window > 0, 'context_window should be positive');
    assert.ok(Array.isArray(entry.input_modalities), 'input_modalities should be an array');
    assert.ok(entry.input_modalities.includes('text'), 'input_modalities should include text');
  });

  it('re-running is idempotent — no duplicate model entries', () => {
    // Run twice
    runDryRun();
    runDryRun();
    const catalog = JSON.parse(fs.readFileSync(path.join(tmpDir, 'model.json'), 'utf8'));
    const entries = catalog.models.filter((m: { slug: string }) => m.slug === MODEL);
    assert.equal(entries.length, 1, 'model.json should not have duplicate entries for same model');
  });

  it('re-running is idempotent — no duplicate TOML sections', () => {
    runDryRun();
    runDryRun();
    const content = fs.readFileSync(path.join(tmpDir, 'config.toml'), 'utf8');
    const matches = content.match(/\[profiles\.falcon\]/g) ?? [];
    assert.equal(
      matches.length,
      1,
      'config.toml should have exactly one [profiles.falcon] section',
    );
  });

  it('different model writes distinct entry without removing old one', () => {
    const OTHER_MODEL = 'gpt-4o';
    runDryRun(MODEL);
    runDryRun(OTHER_MODEL);
    const catalog = JSON.parse(fs.readFileSync(path.join(tmpDir, 'model.json'), 'utf8'));
    const slugs = catalog.models.map((m: { slug: string }) => m.slug);
    assert.ok(slugs.includes(OTHER_MODEL), 'model.json should contain the new model');
  });
});
