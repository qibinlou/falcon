import assert from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { AnthropicGateway } from './anthropic.js';

describe('Anthropic Gateway', () => {
  const gateway = new AnthropicGateway();
  let originalApiKey: string | undefined;
  let originalBaseUrl: string | undefined;
  let originalFetch: typeof global.fetch;

  before(() => {
    originalApiKey = process.env['ANTHROPIC_API_KEY'];
    originalBaseUrl = process.env['ANTHROPIC_BASE_URL'];
    originalFetch = global.fetch;
    delete process.env['ANTHROPIC_BASE_URL'];
  });

  after(() => {
    global.fetch = originalFetch;
    if (originalApiKey !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = originalApiKey;
    } else {
      delete process.env['ANTHROPIC_API_KEY'];
    }
    if (originalBaseUrl !== undefined) {
      process.env['ANTHROPIC_BASE_URL'] = originalBaseUrl;
    } else {
      delete process.env['ANTHROPIC_BASE_URL'];
    }
  });

  test('should have correct name and slug', () => {
    assert.strictEqual(gateway.name, 'Anthropic');
    assert.strictEqual(gateway.slug, 'anthropic');
  });

  test('detectKey should return the environment variable', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    assert.strictEqual(gateway.detectKey(), 'sk-ant-test');

    delete process.env['ANTHROPIC_API_KEY'];
    assert.strictEqual(gateway.detectKey(), undefined);
  });

  test('listModels should fetch, filter, and sort Anthropic models', async () => {
    const mockResponseData = {
      data: [
        {
          id: 'claude-3-5-sonnet-20241022',
          display_name: 'Claude 3.5 Sonnet',
          context_window: 200000,
        },
        { id: 'claude-3-opus-20240229', display_name: 'Claude 3 Opus', context_window: 200000 },
      ],
    };

    global.fetch = async (url: RequestInfo | URL, options?: RequestInit) => {
      // Check request params
      assert.strictEqual(url, 'https://api.anthropic.com/v1/models');
      const headers = options?.headers as Record<string, string> | undefined;
      assert.strictEqual(headers?.['x-api-key'], 'test-key');
      assert.strictEqual(headers?.['anthropic-version'], '2023-06-01');

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockResponseData,
      } as unknown as Response;
    };

    const models = await gateway.listModels('test-key');
    assert.strictEqual(models.length, 2);
    // No `created` or pricing on either model; context is also equal (200k)
    // → stable input order is preserved: Sonnet first, then Opus
    assert.strictEqual(models[0]?.id, 'claude-3-5-sonnet-20241022');
    assert.strictEqual(models[0]?.name, 'Claude 3.5 Sonnet');
    assert.strictEqual(models[0]?.contextLength, 200000);
    assert.strictEqual(models[1]?.id, 'claude-3-opus-20240229');
    assert.strictEqual(models[1]?.name, 'Claude 3 Opus');
    assert.strictEqual(models[1]?.contextLength, 200000);
  });

  test('listModels should throw error on API failure', async () => {
    global.fetch = async () => {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as unknown as Response;
    };

    await assert.rejects(gateway.listModels('bad-key'), /Anthropic API error: 401/);
  });

  test('getEnvConfig should return env containing ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL', () => {
    const config = gateway.getEnvConfig('test-api-key', 'any-model');
    assert.deepStrictEqual(config, {
      env: {
        ANTHROPIC_API_KEY: 'test-api-key',
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
      },
    });
  });

  test('listModels and getEnvConfig should respect custom ANTHROPIC_BASE_URL', async () => {
    process.env['ANTHROPIC_BASE_URL'] = 'https://custom.anthropic.internal/v1';

    global.fetch = async (url: RequestInfo | URL) => {
      assert.strictEqual(url, 'https://custom.anthropic.internal/v1/models');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: [] }),
      } as unknown as Response;
    };

    const models = await gateway.listModels('test-key');
    assert.strictEqual(models.length, 0);

    const config = gateway.getEnvConfig('test-api-key', 'any-model');
    assert.deepStrictEqual(config.env.ANTHROPIC_BASE_URL, 'https://custom.anthropic.internal/v1');

    delete process.env['ANTHROPIC_BASE_URL'];
  });

  test('listModels should properly append v1/models if custom ANTHROPIC_BASE_URL has no v1 prefix', async () => {
    process.env['ANTHROPIC_BASE_URL'] = 'https://custom.anthropic.internal/';

    global.fetch = async (url: RequestInfo | URL) => {
      assert.strictEqual(url, 'https://custom.anthropic.internal/v1/models');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: [] }),
      } as unknown as Response;
    };

    await gateway.listModels('test-key');
    delete process.env['ANTHROPIC_BASE_URL'];
  });
});
