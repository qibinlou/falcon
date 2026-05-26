import assert from 'node:assert';
import { describe, test } from 'node:test';
import net from 'net';
import fs from 'fs';
import path from 'path';
import {
  formatCtx,
  formatPricePerM,
  getFreePort,
  maskString,
  sortModels,
  waitForPort,
  copyToClipboard,
  checkAgentInstalled,
} from './utils.js';
import { setCustomBinPath } from './config.js';

describe('Core Utilities', () => {
  test('formatCtx should format context lengths correctly', () => {
    assert.strictEqual(formatCtx(100), '100 ctx');
    assert.strictEqual(formatCtx(1000), '1k ctx');
    assert.strictEqual(formatCtx(128000), '128k ctx');
    assert.strictEqual(formatCtx(1000000), '1M ctx');
    assert.strictEqual(formatCtx(2500000), '3M ctx'); // rounds via toFixed(0)
  });

  test('maskString should mask strings larger than 16 characters', () => {
    assert.strictEqual(maskString(''), '');
    assert.strictEqual(maskString('short-val'), 'short-val'); // <= 16
    assert.strictEqual(maskString('1234567890123456'), '1234567890123456'); // = 16
    assert.strictEqual(maskString('12345678901234567'), '12345678...4567'); // > 16
    assert.strictEqual(maskString('sk-or-v1-abcdefghijklmnopqrstuvwxyz'), 'sk-or-v1...wxyz');
  });

  test('getFreePort should return a valid local port', async () => {
    const port = await getFreePort();
    assert.ok(port > 0);
    assert.ok(port < 65536);

    // Verify we can bind to it (it's free)
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve());
      });
      server.on('error', reject);
    });
  });

  test('waitForPort should detect an active port and timeout on inactive port', async () => {
    const port = await getFreePort();

    // Should timeout on inactive port
    await assert.rejects(waitForPort(port, 200), /Timeout waiting for port/);

    // Should succeed when port is active
    const server = net.createServer();
    server.listen(port, '127.0.0.1');

    await waitForPort(port, 1000);

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  test('copyToClipboard should execute without crashing', () => {
    const result = copyToClipboard('test clipboard content');
    assert.strictEqual(typeof result, 'boolean');
  });

  test('checkAgentInstalled should check system path and custom path', () => {
    // 1. Unknown command should be false
    assert.strictEqual(checkAgentInstalled('unknown-slug', 'unknown-binary-xyz'), false);

    // 2. Custom path that is valid file and executable should be true
    const tmpFile = path.resolve('./temp-mock-bin');
    fs.writeFileSync(tmpFile, '#!/bin/sh\necho 1', { mode: 0o755 });
    try {
      setCustomBinPath('mock-agent-slug', tmpFile);
      assert.strictEqual(checkAgentInstalled('mock-agent-slug', 'temp-mock-bin'), true);
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  });
});

describe('sortModels', () => {
  // Helper to create a minimal model object for tests
  const m = (opts: { created?: number; promptPerM?: number; contextLength?: number } = {}) => ({
    created: opts.created,
    pricing: opts.promptPerM !== undefined ? { promptPerM: opts.promptPerM } : undefined,
    contextLength: opts.contextLength,
  });

  test('sorts newer models before older ones', () => {
    const older = m({ created: 1000 });
    const newer = m({ created: 2000 });
    const result = [older, newer].sort(sortModels);
    assert.strictEqual(result[0], newer);
    assert.strictEqual(result[1], older);
  });

  test('when created is equal, sorts cheaper models first', () => {
    const expensive = m({ created: 1000, promptPerM: 5 });
    const cheap = m({ created: 1000, promptPerM: 1 });
    const result = [expensive, cheap].sort(sortModels);
    assert.strictEqual(result[0], cheap);
    assert.strictEqual(result[1], expensive);
  });

  test('free models (promptPerM = 0) sort before paid models', () => {
    const paid = m({ created: 1000, promptPerM: 0.5 });
    const free = m({ created: 1000, promptPerM: 0 });
    const result = [paid, free].sort(sortModels);
    assert.strictEqual(result[0], free);
  });

  test('when created and price are equal, sorts larger context first', () => {
    const small = m({ created: 1000, promptPerM: 1, contextLength: 32_000 });
    const large = m({ created: 1000, promptPerM: 1, contextLength: 1_000_000 });
    const result = [small, large].sort(sortModels);
    assert.strictEqual(result[0], large);
  });

  test('models without created are treated as oldest (0)', () => {
    const withCreated = m({ created: 1 });
    const withoutCreated = m({});
    const result = [withoutCreated, withCreated].sort(sortModels);
    assert.strictEqual(result[0], withCreated);
  });

  test('fully identical models return 0 (stable)', () => {
    const a = m({ created: 500, promptPerM: 2, contextLength: 128_000 });
    const b = m({ created: 500, promptPerM: 2, contextLength: 128_000 });
    assert.strictEqual(sortModels(a, b), 0);
  });

  test('sorts a mixed list correctly (newest → cheapest → largest ctx)', () => {
    const models = [
      m({ created: 100, promptPerM: 1, contextLength: 32_000 }),
      m({ created: 200, promptPerM: 5, contextLength: 128_000 }),
      m({ created: 200, promptPerM: 1, contextLength: 64_000 }),
      m({ created: 200, promptPerM: 1, contextLength: 128_000 }),
      m({ created: 100, promptPerM: 0, contextLength: 200_000 }),
    ];
    const sorted = [...models].sort(sortModels);
    // created=200 group first
    assert.strictEqual(sorted[0]?.created, 200);
    assert.strictEqual(sorted[1]?.created, 200);
    assert.strictEqual(sorted[2]?.created, 200);
    // Within created=200: cheapest (promptPerM=1) before expensive (5)
    assert.strictEqual(sorted[0]?.pricing?.promptPerM, 1);
    // Within created=200, promptPerM=1: larger ctx first
    assert.strictEqual(sorted[0]?.contextLength, 128_000);
    assert.strictEqual(sorted[1]?.contextLength, 64_000);
  });
});

describe('formatPricePerM', () => {
  test('returns "free" for 0', () => {
    assert.strictEqual(formatPricePerM(0), 'free');
  });

  test('formats standard prices with 2 decimal places', () => {
    assert.strictEqual(formatPricePerM(2), '$2.00/1M');
    assert.strictEqual(formatPricePerM(0.15), '$0.15/1M');
    assert.strictEqual(formatPricePerM(30), '$30.00/1M');
  });

  test('formats very small prices with 4 decimal places', () => {
    assert.strictEqual(formatPricePerM(0.005), '$0.0050/1M');
    assert.strictEqual(formatPricePerM(0.001), '$0.0010/1M');
  });
});
