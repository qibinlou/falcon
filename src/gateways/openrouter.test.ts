import assert from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { OpenRouterGateway } from './openrouter.js';

describe('OpenRouter Gateway', () => {
  const gateway = new OpenRouterGateway();
  let originalApiKey: string | undefined;
  let originalFetch: typeof global.fetch;

  before(() => {
    originalApiKey = process.env['OPENROUTER_API_KEY'];
    originalFetch = global.fetch;
  });

  after(() => {
    global.fetch = originalFetch;
    if (originalApiKey !== undefined) {
      process.env['OPENROUTER_API_KEY'] = originalApiKey;
    } else {
      delete process.env['OPENROUTER_API_KEY'];
    }
  });

  test('should have correct name and slug', () => {
    assert.strictEqual(gateway.name, 'OpenRouter');
    assert.strictEqual(gateway.slug, 'openrouter');
  });

  test('detectKey should return the environment variable', () => {
    process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
    assert.strictEqual(gateway.detectKey(), 'sk-or-test');

    delete process.env['OPENROUTER_API_KEY'];
    assert.strictEqual(gateway.detectKey(), undefined);
  });

  test('getEnvConfig should return OpenRouter settings and URLs', () => {
    const config = gateway.getEnvConfig('or-key-123', 'some-model');
    assert.deepStrictEqual(config, {
      env: {
        OPENROUTER_API_KEY: 'or-key-123',
        OPENAI_API_KEY: 'or-key-123',
        OPENAI_BASE_URL: 'https://openrouter.ai/api/v1',
        ANTHROPIC_API_KEY: 'or-key-123',
        ANTHROPIC_BASE_URL: 'https://openrouter.ai/api',
      },
      baseUrl: 'https://openrouter.ai/api/v1',
    });
  });

  test('listModels should fetch, map, and sort models', async () => {
    const mockResponseData = {
      data: [
        {
          id: 'openai/gpt-4o',
          name: 'GPT-4o',
          context_length: 128000,
          pricing: { prompt: '0.000005', completion: '0.000015' },
        },
        {
          id: 'anthropic/claude-3-5-sonnet',
          name: 'Claude 3.5 Sonnet',
          context_length: 200000,
          pricing: { prompt: '0.000003', completion: '0.000015' },
        },
      ],
    };

    global.fetch = async (url: RequestInfo | URL, options?: RequestInit) => {
      assert.strictEqual(url, 'https://openrouter.ai/api/v1/models');
      const headers = options?.headers as Record<string, string> | undefined;
      assert.strictEqual(headers?.['Authorization'], 'Bearer or-key-test');

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockResponseData,
      } as unknown as Response;
    };

    const models = await gateway.listModels('or-key-test');
    assert.strictEqual(models.length, 2);
    // Both have no `created` timestamp; cheaper model sorts first (3 < 5 $/1M)
    assert.strictEqual(models[0]?.id, 'anthropic/claude-3-5-sonnet');
    assert.strictEqual(models[0]?.contextLength, 200000);
    // Pricing is now formatted as $/1M (0.000003/token → $3.00/1M)
    assert.strictEqual(models[0]?.pricing?.prompt, '$3.00/1M');

    assert.strictEqual(models[1]?.id, 'openai/gpt-4o');
    assert.strictEqual(models[1]?.pricing?.prompt, '$5.00/1M');
  });

  test('listModels should throw error on failure', async () => {
    global.fetch = async () => {
      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as unknown as Response;
    };

    await assert.rejects(gateway.listModels('key'), /OpenRouter API error: 500/);
  });
});
