import assert from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { OpenAIGateway } from './openai.js';
import { setLocalModelMetadataCache, clearModelMetadataCache } from './shared/modelEnricher.js';

describe('OpenAI Gateway', () => {
  const gateway = new OpenAIGateway();
  let originalApiKey: string | undefined;
  let originalBaseUrl: string | undefined;
  let originalFetch: typeof global.fetch;

  before(() => {
    originalApiKey = process.env['OPENAI_API_KEY'];
    originalBaseUrl = process.env['OPENAI_BASE_URL'];
    originalFetch = global.fetch;
    delete process.env['OPENAI_BASE_URL'];

    setLocalModelMetadataCache({
      'gpt-3.5-turbo': {
        contextLength: 16385,
        pricing: {
          prompt: '$0.50/1M',
          completion: '$1.50/1M',
          promptPerM: 0.5,
        },
      },
      'gpt-4o': {
        contextLength: 128000,
        pricing: {
          prompt: '$2.50/1M',
          completion: '$10.00/1M',
          promptPerM: 2.5,
        },
      },
      'o1-mini': {
        contextLength: 128000,
        pricing: {
          prompt: '$3.00/1M',
          completion: '$12.00/1M',
          promptPerM: 3.0,
        },
      },
    });
  });

  after(() => {
    global.fetch = originalFetch;
    clearModelMetadataCache();
    if (originalApiKey !== undefined) {
      process.env['OPENAI_API_KEY'] = originalApiKey;
    } else {
      delete process.env['OPENAI_API_KEY'];
    }
    if (originalBaseUrl !== undefined) {
      process.env['OPENAI_BASE_URL'] = originalBaseUrl;
    } else {
      delete process.env['OPENAI_BASE_URL'];
    }
  });

  test('should have correct name and slug', () => {
    assert.strictEqual(gateway.name, 'OpenAI');
    assert.strictEqual(gateway.slug, 'openai');
  });

  test('detectKey should return the environment variable', () => {
    process.env['OPENAI_API_KEY'] = 'sk-openai-test';
    assert.strictEqual(gateway.detectKey(), 'sk-openai-test');

    delete process.env['OPENAI_API_KEY'];
    assert.strictEqual(gateway.detectKey(), undefined);
  });

  test('getEnvConfig should return env containing OPENAI_API_KEY', () => {
    const config = gateway.getEnvConfig('test-api-key', 'any-model');
    assert.deepStrictEqual(config, {
      env: {
        OPENAI_API_KEY: 'test-api-key',
      },
    });
  });

  test('listModels should fetch, filter, and sort OpenAI models', async () => {
    const mockResponseData = {
      data: [
        { id: 'gpt-4o' },
        { id: 'text-davinci-003' }, // not useful, filtered out
        { id: 'o1-mini' },
        { id: 'whisper-1' }, // not useful, filtered out
        { id: 'gpt-3.5-turbo' },
      ],
    };

    global.fetch = async (url: RequestInfo | URL, options?: RequestInit) => {
      // Check request params
      assert.strictEqual(url, 'https://api.openai.com/v1/models');
      const headers = options?.headers as Record<string, string> | undefined;
      assert.strictEqual(headers?.['Authorization'], 'Bearer test-key');

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockResponseData,
      } as unknown as Response;
    };

    const models = await gateway.listModels('test-key');
    assert.strictEqual(models.length, 3);

    // With metadata enrichment, models are sorted by cheapest first:
    // gpt-3.5-turbo ($0.50/1M) -> gpt-4o ($2.50/1M) -> o1-mini ($3.00/1M)
    assert.strictEqual(models[0]?.id, 'gpt-3.5-turbo');
    assert.strictEqual(models[0]?.contextLength, 16385);
    assert.strictEqual(models[0]?.pricing?.prompt, '$0.50/1M');

    assert.strictEqual(models[1]?.id, 'gpt-4o');
    assert.strictEqual(models[1]?.contextLength, 128000);
    assert.strictEqual(models[1]?.pricing?.prompt, '$2.50/1M');

    assert.strictEqual(models[2]?.id, 'o1-mini');
    assert.strictEqual(models[2]?.contextLength, 128000);
    assert.strictEqual(models[2]?.pricing?.prompt, '$3.00/1M');
  });

  test('listModels should throw error on API failure', async () => {
    global.fetch = async () => {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as unknown as Response;
    };

    await assert.rejects(gateway.listModels('bad-key'), /OpenAI API error: 401/);
  });

  test('listModels and getEnvConfig should respect custom OPENAI_BASE_URL', async () => {
    process.env['OPENAI_BASE_URL'] = 'https://custom.openai.internal/v1';

    global.fetch = async (url: RequestInfo | URL) => {
      assert.strictEqual(url, 'https://custom.openai.internal/v1/models');
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
    assert.deepStrictEqual(config.env.OPENAI_BASE_URL, 'https://custom.openai.internal/v1');

    delete process.env['OPENAI_BASE_URL'];
  });

  test('listModels should properly append v1/models if custom OPENAI_BASE_URL has no v1 prefix', async () => {
    process.env['OPENAI_BASE_URL'] = 'https://custom.openai.internal/';

    global.fetch = async (url: RequestInfo | URL) => {
      assert.strictEqual(url, 'https://custom.openai.internal/v1/models');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: [] }),
      } as unknown as Response;
    };

    await gateway.listModels('test-key');
    delete process.env['OPENAI_BASE_URL'];
  });
});
