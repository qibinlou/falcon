/**
 * e2e/03-dry-run.test.ts
 *
 * Tests `falcon launch --dry-run` for all agent/gateway combinations.
 * Verifies:
 *  - Correct agent command is shown
 *  - Correct model is reflected
 *  - Gateway-specific env vars appear
 *  - API keys are masked in output
 *  - Extra args pass through correctly
 *
 * Tests that require a specific key are skipped when the key is absent.
 */

import { before, describe, it } from 'node:test';
import {
  assertContains,
  assertExitCode,
  assertNotContains,
  buildEnv,
  getKey,
  loadDotEnv,
  missingKey,
  spawnCli,
} from './helpers.ts';

before(() => {
  loadDotEnv();
});

// ─── OpenRouter (uses a free model available to all valid keys) ──────────────

describe('Dry Run — Claude + OpenRouter', () => {
  const MODEL = 'deepseek/deepseek-v4-flash:free';
  const GW = 'openrouter';

  it('exits 0 and shows claude command', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    const r = spawnCli(['launch', 'claude', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: buildEnv({ OPENROUTER_API_KEY: key }),
    });
    assertExitCode(r, 0);
    const out = r.stdout + r.stderr;
    assertContains(out, 'claude', 'agent name');
    assertContains(out, MODEL, 'model name');
    assertContains(out, 'OpenRouter', 'gateway name');
  });

  it('masks the API key in output', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    const r = spawnCli(['launch', 'claude', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: buildEnv({ OPENROUTER_API_KEY: key }),
    });
    // Full raw key must not appear in output
    assertNotContains(r.stdout + r.stderr, key, 'key masking');
  });

  it('shows ANTHROPIC_BASE_URL in environment output', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    const r = spawnCli(['launch', 'claude', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: buildEnv({ OPENROUTER_API_KEY: key }),
    });
    // ANTHROPIC_BASE_URL is present in the environment section (may be masked)
    assertContains(r.stdout + r.stderr, 'ANTHROPIC_BASE_URL', 'ANTHROPIC_BASE_URL env key');
  });

  it('shows isolated CLAUDE_CONFIG_DIR in environment output', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    const r = spawnCli(['launch', 'claude', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: buildEnv({ OPENROUTER_API_KEY: key }),
    });
    const out = r.stdout + r.stderr;
    assertContains(out, 'CLAUDE_CONFIG_DIR', 'CLAUDE_CONFIG_DIR env key');
    assertContains(out, 'aude', 'CLAUDE_CONFIG_DIR value ends with claude (or masked)');
  });
});

describe('Dry Run — Codex + OpenRouter', () => {
  const MODEL = 'deepseek/deepseek-v4-flash:free';
  const GW = 'openrouter';

  it('exits 0 and shows codex command with --profile falcon', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    const r = spawnCli(['launch', 'codex', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: buildEnv({ OPENROUTER_API_KEY: key }),
    });
    assertExitCode(r, 0);
    const out = r.stdout + r.stderr;
    assertContains(out, 'codex', 'agent name');
    assertContains(out, '--profile', 'profile flag');
    assertContains(out, 'falcon', 'profile name');
    assertContains(out, MODEL, 'model name');
  });

  it('shows OPENAI_BASE_URL in environment output', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    const r = spawnCli(['launch', 'codex', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: buildEnv({ OPENROUTER_API_KEY: key }),
    });
    // OPENAI_BASE_URL is present in the environment section
    assertContains(r.stdout + r.stderr, 'OPENAI_BASE_URL', 'OPENAI_BASE_URL env key');
  });

  it('shows isolated CODEX_HOME in environment output', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    const r = spawnCli(['launch', 'codex', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: buildEnv({ OPENROUTER_API_KEY: key }),
    });
    const out = r.stdout + r.stderr;
    assertContains(out, 'CODEX_HOME', 'CODEX_HOME env key');
    assertContains(out, 'odex', 'CODEX_HOME value ends with codex (or masked)');
  });
});

// ─── Anthropic gateway ────────────────────────────────────────────────────────

describe('Dry Run — Claude + Anthropic gateway', () => {
  const MODEL = 'claude-haiku-4-5';
  const GW = 'anthropic';

  it('exits 0 and shows Anthropic gateway name', (ctx) => {
    const skip = missingKey('ANTHROPIC_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('ANTHROPIC_API_KEY') ?? '';
    const r = spawnCli(['launch', 'claude', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: buildEnv({ ANTHROPIC_API_KEY: key }),
    });
    assertExitCode(r, 0);
    // Gateway name and ANTHROPIC_BASE_URL env key must appear
    assertContains(r.stdout + r.stderr, 'Anthropic', 'Anthropic gateway name');
    assertContains(r.stdout + r.stderr, 'ANTHROPIC_BASE_URL', 'ANTHROPIC_BASE_URL present');
  });

  it('masks the API key', (ctx) => {
    const skip = missingKey('ANTHROPIC_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('ANTHROPIC_API_KEY') ?? '';
    const r = spawnCli(['launch', 'claude', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: buildEnv({ ANTHROPIC_API_KEY: key }),
    });
    assertNotContains(r.stdout + r.stderr, key, 'key masking');
  });
});

describe('Dry Run — Codex + Anthropic gateway', () => {
  const MODEL = 'claude-haiku-4-5';
  const GW = 'anthropic';

  it('exits 0 and shows codex command', (ctx) => {
    const skip = missingKey('ANTHROPIC_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('ANTHROPIC_API_KEY') ?? '';
    const r = spawnCli(['launch', 'codex', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: buildEnv({ ANTHROPIC_API_KEY: key }),
    });
    assertExitCode(r, 0);
    assertContains(r.stdout + r.stderr, 'codex', 'agent name');
    assertContains(r.stdout + r.stderr, MODEL, 'model name');
  });
});

// ─── OpenAI gateway ──────────────────────────────────────────────────────────

describe('Dry Run — Claude + OpenAI gateway', () => {
  const MODEL = 'gpt-4o';
  const GW = 'openai';

  it('exits 0 and shows claude command', (ctx) => {
    const skip = missingKey('OPENAI_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENAI_API_KEY') ?? '';
    const r = spawnCli(['launch', 'claude', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: buildEnv({ OPENAI_API_KEY: key }),
    });
    assertExitCode(r, 0);
    assertContains(r.stdout + r.stderr, 'claude', 'agent name');
  });
});

describe('Dry Run — Codex + OpenAI gateway', () => {
  const MODEL = 'gpt-4o';
  const GW = 'openai';

  it('exits 0 and shows codex with profile falcon', (ctx) => {
    const skip = missingKey('OPENAI_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENAI_API_KEY') ?? '';
    const r = spawnCli(['launch', 'codex', '-m', MODEL, '-g', GW, '--dry-run'], {
      env: buildEnv({ OPENAI_API_KEY: key }),
    });
    assertExitCode(r, 0);
    assertContains(r.stdout + r.stderr, 'codex', 'agent name');
    assertContains(r.stdout + r.stderr, 'falcon', 'profile name');
  });
});

// ─── Extra args pass-through ──────────────────────────────────────────────────

describe('Dry Run — Extra args pass-through', () => {
  it('extra args appear in command line for claude', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    const MODEL = 'deepseek/deepseek-v4-flash:free';
    const r = spawnCli(
      ['launch', 'claude', '-m', MODEL, '-g', 'openrouter', '--dry-run', '--verbose'],
      { env: buildEnv({ OPENROUTER_API_KEY: key }) },
    );
    assertExitCode(r, 0);
    assertContains(r.stdout + r.stderr, '--verbose', 'extra arg in command');
  });

  it('extra args appear in command line for codex', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    const MODEL = 'deepseek/deepseek-v4-flash:free';
    const r = spawnCli(
      ['launch', 'codex', '-m', MODEL, '-g', 'openrouter', '--dry-run', 'login', 'status'],
      { env: buildEnv({ OPENROUTER_API_KEY: key }) },
    );
    assertExitCode(r, 0);
    assertContains(r.stdout + r.stderr, 'login', 'extra arg: login');
    assertContains(r.stdout + r.stderr, 'status', 'extra arg: status');
  });
});

// ─── Custom Config Directories ────────────────────────────────────────────────

describe('Dry Run — Custom Config Directories', () => {
  const MODEL = 'deepseek/deepseek-v4-flash:free';

  it('honors pre-existing CLAUDE_CONFIG_DIR in environment', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    const customDir = '/tmp/ccdir';
    const r = spawnCli(['launch', 'claude', '-m', MODEL, '-g', 'openrouter', '--dry-run'], {
      env: {
        ...buildEnv({ OPENROUTER_API_KEY: key }),
        CLAUDE_CONFIG_DIR: customDir,
      },
    });
    const out = r.stdout + r.stderr;
    assertContains(out, 'CLAUDE_CONFIG_DIR=/tmp/ccdir', 'custom CLAUDE_CONFIG_DIR preserved');
  });

  it('honors pre-existing CODEX_HOME in environment', (ctx) => {
    const skip = missingKey('OPENROUTER_API_KEY');
    if (skip) return ctx.skip(skip);

    const key = getKey('OPENROUTER_API_KEY') ?? '';
    const customDir = '/tmp/cxdir';
    const r = spawnCli(['launch', 'codex', '-m', MODEL, '-g', 'openrouter', '--dry-run'], {
      env: {
        ...buildEnv({ OPENROUTER_API_KEY: key }),
        CODEX_HOME: customDir,
      },
    });
    const out = r.stdout + r.stderr;
    assertContains(out, 'CODEX_HOME=/tmp/cxdir', 'custom CODEX_HOME preserved');
  });
});

// ─── No gateway available ─────────────────────────────────────────────────────

describe('Dry Run — No gateway', () => {
  it('exits 1 with error when no API keys are set', () => {
    const r = spawnCli(['launch', 'claude', '-m', 'some-model', '--dry-run'], {
      env: buildEnv({}),
    });
    assertExitCode(r, 1);
    // CLI prints: "No API gateway available for dry run."
    assertContains(r.stdout + r.stderr, 'No API gateway', 'no-gateway error');
  });
});
