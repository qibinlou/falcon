/**
 * src/cli.test.ts
 *
 * Unit tests for CLI parsing structure, option definition, and pre-processing argument redirection.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { program, preprocessArgs, parseLaunchArgs } from './cli.js';

describe('CLI Unit Tests', () => {
  describe('preprocessArgs()', () => {
    it('redirects launch <agent> --help by removing launch', () => {
      const input = ['node', 'cli.js', 'launch', 'opencode', '--help'];
      const expected = ['node', 'cli.js', 'opencode', '--help'];
      assert.deepEqual(preprocessArgs(input), expected);
    });

    it('redirects launch <agent> -h by removing launch', () => {
      const input = ['node', 'cli.js', 'launch', 'claude', '-h'];
      const expected = ['node', 'cli.js', 'claude', '-h'];
      assert.deepEqual(preprocessArgs(input), expected);
    });

    it('does not redirect launch <agent> command args if no help option present', () => {
      const input = ['node', 'cli.js', 'launch', 'opencode', 'auth', 'status'];
      assert.deepEqual(preprocessArgs(input), input);
    });

    it('does not redirect launch claude auth status', () => {
      const input = ['node', 'cli.js', 'launch', 'claude', 'auth', 'status'];
      assert.deepEqual(preprocessArgs(input), input);
    });

    it('does not redirect launch with no agent name', () => {
      const input = ['node', 'cli.js', 'launch', '--help'];
      assert.deepEqual(preprocessArgs(input), input);
    });

    it('does not redirect non-agent names', () => {
      const input = ['node', 'cli.js', 'launch', 'invalidagent', '--help'];
      assert.deepEqual(preprocessArgs(input), input);
    });
  });

  describe('Commander CLI definitions', () => {
    it('defines name and version', () => {
      assert.equal(program.name(), 'falcon');
    });

    it('has all registered subcommands', () => {
      const commandNames = program.commands.map((c) => c.name());
      assert.ok(commandNames.includes('launch'));
      assert.ok(commandNames.includes('models'));
      assert.ok(commandNames.includes('codex'));
      assert.ok(commandNames.includes('claude'));
      assert.ok(commandNames.includes('opencode'));
      assert.ok(commandNames.includes('pi'));
    });

    it('defines the correct options on subcommands', () => {
      const launchCmd = program.commands.find((c) => c.name() === 'launch');
      assert.ok(launchCmd);
      const modelOpt = launchCmd.options.find((o) => o.short === '-m');
      assert.ok(modelOpt);
      assert.equal(modelOpt.long, '--model');

      const gatewayOpt = launchCmd.options.find((o) => o.short === '-g');
      assert.ok(gatewayOpt);
      assert.equal(gatewayOpt.long, '--gateway');
    });
  });

  describe('parseLaunchArgs()', () => {
    it('extracts model and gateway options from extraArgs and cleans extraArgs', () => {
      const extraArgs = ['-m', 'openrouter/free', '-g', 'openrouter', 'some-prompt'];
      const options = {};
      const result = parseLaunchArgs(extraArgs, options);
      assert.equal(result.model, 'openrouter/free');
      assert.equal(result.gateway, 'openrouter');
      assert.deepEqual(result.cleanedExtraArgs, ['some-prompt']);
    });

    it('prefers options from options parameter if already parsed by commander', () => {
      const extraArgs = ['some-prompt'];
      const options = { model: 'gpt-4o', gateway: 'openai' };
      const result = parseLaunchArgs(extraArgs, options);
      assert.equal(result.model, 'gpt-4o');
      assert.equal(result.gateway, 'openai');
      assert.deepEqual(result.cleanedExtraArgs, ['some-prompt']);
    });
  });
});
