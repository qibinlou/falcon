/**
 * e2e/04-models.test.ts
 *
 * Tests `falcon models -g <gateway>` — makes live API calls to verify model
 * listing works end-to-end. Skipped when the required key is absent.
 */

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import {
  assertContains,
  assertExitCode,
  buildEnv,
  getKey,
  loadDotEnv,
  missingKey,
  spawnCli,
} from './helpers.ts';

before(() => {
  loadDotEnv();
});

describe('Models Command — OpenRouter', () => {
  it('returns at least one model and exits 0', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    // Live network call — allow more time
    const r = spawnCli(['models', '-g', 'openrouter'], {
      env: buildEnv({ OPENROUTER_API_KEY: key }),
      timeout: 30_000,
    });
    assertExitCode(r, 0);
    const out = r.stdout + r.stderr;
    assertContains(out, 'OpenRouter', 'gateway name in header');
    // Should list at least one model id (contains a slash typical for openrouter ids)
    assert.match(out, /\w+\/\w+/, 'at least one model id with provider/name format');
  });

  it('output includes model count', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    const r = spawnCli(['models', '-g', 'openrouter'], {
      env: buildEnv({ OPENROUTER_API_KEY: key }),
      timeout: 30_000,
    });
    assertExitCode(r, 0);
    // Header line: "OpenRouter — N models:"
    assert.match(r.stdout + r.stderr, /\d+ models/, 'model count in header');
  });
});

describe('Models Command — Anthropic', () => {
  it('returns at least one model and exits 0', (ctx) => {
    const skip = missingKey('ANTHROPIC_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('ANTHROPIC_API_KEY') ?? '';
    const r = spawnCli(['models', '-g', 'anthropic'], {
      env: buildEnv({ ANTHROPIC_API_KEY: key }),
      timeout: 30_000,
    });
    assertExitCode(r, 0);
    const out = r.stdout + r.stderr;
    assertContains(out, 'Anthropic', 'gateway name');
    // Claude model ids start with "claude-"
    assert.match(out, /claude-/, 'at least one claude model id');
  });
});

describe('Models Command — OpenAI', () => {
  it('returns at least one model and exits 0', (ctx) => {
    const skip = missingKey('OPENAI_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENAI_API_KEY') ?? '';
    const r = spawnCli(['models', '-g', 'openai'], {
      env: buildEnv({ OPENAI_API_KEY: key }),
      timeout: 30_000,
    });
    assertExitCode(r, 0);
    const out = r.stdout + r.stderr;
    assertContains(out, 'OpenAI', 'gateway name');
    // GPT model ids contain "gpt"
    assert.match(out, /gpt-/i, 'at least one gpt model id');
  });
});

describe('Models Command — Error cases', () => {
  it('exits 1 for unknown gateway', () => {
    const r = spawnCli(['models', '-g', 'notexists']);
    assertExitCode(r, 1);
    assertContains(r.stdout + r.stderr, 'notexists', 'gateway name in error');
  });

  it('exits 1 when no keys are set', () => {
    const r = spawnCli(['models'], {
      env: buildEnv({}),
    });
    assertExitCode(r, 1);
    // CLI prints: "No API keys detected."
    assertContains(r.stdout + r.stderr, 'No API keys', 'no-keys error');
  });
});
