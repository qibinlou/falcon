import assert from 'node:assert';
import { describe, test } from 'node:test';
import { ALL_AGENTS, findAgent } from './index.js';

describe('Agents Registry', () => {
  test('ALL_AGENTS should contain all launchers', () => {
    assert.ok(ALL_AGENTS.length >= 3);
    const slugs = ALL_AGENTS.map((a) => a.slug);
    assert.ok(slugs.includes('claude'));
    assert.ok(slugs.includes('codex'));
    assert.ok(slugs.includes('opencode'));
  });

  test('findAgent should find agent by slug case-insensitively', () => {
    const claude = findAgent('claude');
    assert.ok(claude);
    assert.strictEqual(claude?.slug, 'claude');

    const codex = findAgent('CODEX');
    assert.ok(codex);
    assert.strictEqual(codex?.slug, 'codex');
  });

  test('findAgent should find agent by name case-insensitively', () => {
    const claude = findAgent('Claude Code');
    assert.ok(claude);
    assert.strictEqual(claude?.slug, 'claude');
  });

  test('findAgent should return undefined for unknown agent', () => {
    const unknown = findAgent('non-existent-agent');
    assert.strictEqual(unknown, undefined);
  });
});
