/**
 * e2e/02-gateway-detect.test.ts
 *
 * Tests `falcon launch --list-gateways` with different API key combinations.
 * Each test isolates exactly which keys are present in the spawned environment.
 */

import { before, describe, it } from 'node:test';
import {
  assertContains,
  assertExitCode,
  buildEnv,
  getKey,
  loadDotEnv,
  spawnCli,
} from './helpers.ts';

before(() => {
  loadDotEnv();
});

describe('Gateway Detection (--list-gateways)', () => {
  it('detects OpenRouter when OPENROUTER_API_KEY is set', () => {
    const key = getKey('OPENROUTER_API_KEY');
    if (!key) {
      // Use a fake key — detection is purely env-var presence
      const fakeKey = 'sk-or-fake-test-key-for-detection';
      const r = spawnCli(['launch', '--list-gateways'], {
        env: buildEnv({ OPENROUTER_API_KEY: fakeKey }),
      });
      assertExitCode(r, 0);
      assertContains(r.stdout + r.stderr, 'OpenRouter', '--list-gateways OpenRouter');
    } else {
      const r = spawnCli(['launch', '--list-gateways'], {
        env: buildEnv({ OPENROUTER_API_KEY: key }),
      });
      assertExitCode(r, 0);
      assertContains(r.stdout + r.stderr, 'OpenRouter', '--list-gateways OpenRouter');
    }
  });

  it('detects OpenAI when OPENAI_API_KEY is set', () => {
    const key = getKey('OPENAI_API_KEY') ?? 'sk-fake-openai-key-for-detection';
    const r = spawnCli(['launch', '--list-gateways'], {
      env: buildEnv({ OPENAI_API_KEY: key }),
    });
    assertExitCode(r, 0);
    assertContains(r.stdout + r.stderr, 'OpenAI', '--list-gateways OpenAI');
  });

  it('detects Anthropic when ANTHROPIC_API_KEY is set', () => {
    const key = getKey('ANTHROPIC_API_KEY') ?? 'sk-ant-fake-key-for-detection';
    const r = spawnCli(['launch', '--list-gateways'], {
      env: buildEnv({ ANTHROPIC_API_KEY: key }),
    });
    assertExitCode(r, 0);
    assertContains(r.stdout + r.stderr, 'Anthropic', '--list-gateways Anthropic');
  });

  it('detects multiple gateways when multiple keys are set', () => {
    const orKey = getKey('OPENROUTER_API_KEY') ?? 'sk-or-fake-multi';
    const oaiKey = getKey('OPENAI_API_KEY') ?? 'sk-fake-multi-openai';
    const r = spawnCli(['launch', '--list-gateways'], {
      env: buildEnv({
        OPENROUTER_API_KEY: orKey,
        OPENAI_API_KEY: oaiKey,
      }),
    });
    assertExitCode(r, 0);
    assertContains(r.stdout + r.stderr, 'OpenRouter', 'multi-gateway OpenRouter');
    assertContains(r.stdout + r.stderr, 'OpenAI', 'multi-gateway OpenAI');
  });

  it('exits 1 with helpful message when no API keys are set', () => {
    const r = spawnCli(['launch', '--list-gateways'], {
      env: buildEnv({}), // strip all gateway keys
    });
    assertExitCode(r, 1);
    const combined = r.stdout + r.stderr;
    assertContains(combined, 'No API keys', 'no-keys error message');
  });
});
