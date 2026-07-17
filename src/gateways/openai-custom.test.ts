import assert from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { OpenAICustomGateway } from './openai-custom';
import { setLocalModelMetadataCache, clearModelMetadataCache } from './shared/modelEnricher.js';

describe('OpenAICustomGateway', () => {
  let originalFetch: typeof global.fetch;
  let originalEnvKey: string | undefined;

  // A concrete instance using defaults (no filter, no custom headers)
  const gateway = new OpenAICustomGateway({
    name: 'TestProvider',
    slug: 'test-provider',
    baseUrl: 'https://api.test-provider.ai/v1',
    apiKeyEnvVar: 'TEST_PROVIDER_API_KEY',
    provider: 'TestProvider',
  });

  before(() => {
    originalFetch = global.fetch;
    originalEnvKey = process.env['TEST_PROVIDER_API_KEY'];
    delete process.env['TEST_PROVIDER_API_KEY'];

    setLocalModelMetadataCache({
      'test-model-large': {
        contextLength: 128000,
        pricing: {
          prompt: '$2.00/1M',
          completion: '$8.00/1M',
          promptPerM: 2.0,
        },
      },
    });
  });

  after(() => {
    global.fetch = originalFetch;
    clearModelMetadataCache();
    if (originalEnvKey !== undefined) {
      process.env['TEST_PROVIDER_API_KEY'] = originalEnvKey;
    } else {
      delete process.env['TEST_PROVIDER_API_KEY'];
    }
  });

  test('should have correct name and slug', () => {
    assert.strictEqual(gateway.name, 'TestProvider');
    assert.strictEqual(gateway.slug, 'test-provider');
  });

  test('detectKey should return the configured env var value', () => {
    process.env['TEST_PROVIDER_API_KEY'] = 'sk-test-key-123';
    assert.strictEqual(gateway.detectKey(), 'sk-test-key-123');

    delete process.env['TEST_PROVIDER_API_KEY'];
    assert.strictEqual(gateway.detectKey(), undefined);
  });

  test('getEnvConfig should set OPENAI_API_KEY, OPENAI_BASE_URL, and provider key', () => {
    const config = gateway.getEnvConfig('my-api-key', 'some-model');
    assert.deepStrictEqual(config, {
      env: {
        OPENAI_API_KEY: 'my-api-key',
        OPENAI_BASE_URL: 'https://api.test-provider.ai/v1',
        TEST_PROVIDER_API_KEY: 'my-api-key',
      },
      baseUrl: 'https://api.test-provider.ai/v1',
    });
  });

  test('listModels should fetch and return all models when no filter is set', async () => {
    const mockData = {
      data: [
        { id: 'test-model-large', context_length: 128000 },
        { id: 'test-model-small', context_length: 8192 },
      ],
    };

    global.fetch = async (url: RequestInfo | URL, options?: RequestInit) => {
      assert.strictEqual(url, 'https://api.test-provider.ai/v1/models');
      const headers = options?.headers as Record<string, string> | undefined;
      assert.strictEqual(headers?.['Authorization'], 'Bearer test-key');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockData,
      } as unknown as Response;
    };

    const models = await gateway.listModels('test-key');
    assert.strictEqual(models.length, 2);
    // Check that provider is set correctly
    assert.ok(models.every((m: { provider?: string }) => m.provider === 'TestProvider'));

    // The model with metadata should be enriched
    const large = models.find((m) => m.id === 'test-model-large');
    assert.ok(large);
    assert.strictEqual(large.contextLength, 128000);
    assert.strictEqual(large.pricing?.prompt, '$2.00/1M');
  });

  test('listModels should apply custom filterModel when provided', async () => {
    const filteredGateway = new OpenAICustomGateway({
      name: 'FilteredProvider',
      slug: 'filtered',
      baseUrl: 'https://api.filtered.ai/v1',
      apiKeyEnvVar: 'FILTERED_API_KEY',
      provider: 'FilteredProvider',
      filterModel: (m) => m.id.startsWith('good-'),
    });

    const mockData = {
      data: [{ id: 'good-model-1' }, { id: 'bad-model-2' }, { id: 'good-model-3' }],
    };

    global.fetch = async () => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockData,
      } as unknown as Response;
    };

    const models = await filteredGateway.listModels('key');
    assert.strictEqual(models.length, 2);
    assert.ok(models.every((m: { id: string }) => m.id.startsWith('good-')));
  });

  test('listModels should use custom auth headers when provided', async () => {
    const customAuthGateway = new OpenAICustomGateway({
      name: 'CustomAuth',
      slug: 'custom-auth',
      baseUrl: 'https://api.custom-auth.ai/v1',
      apiKeyEnvVar: 'CUSTOM_AUTH_KEY',
      provider: 'CustomAuth',
      getAuthHeaders: (apiKey: string) => ({
        'x-api-key': apiKey,
        'x-custom-version': '2024-01-01',
      }),
    });

    global.fetch = async (_url: RequestInfo | URL, options?: RequestInit) => {
      const headers = options?.headers as Record<string, string> | undefined;
      assert.strictEqual(headers?.['x-api-key'], 'custom-key');
      assert.strictEqual(headers?.['x-custom-version'], '2024-01-01');
      // Should NOT have the default Authorization header
      assert.strictEqual(headers?.['Authorization'], undefined);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: [] }),
      } as unknown as Response;
    };

    const models = await customAuthGateway.listModels('custom-key');
    assert.strictEqual(models.length, 0);
  });

  test('listModels should throw error on API failure', async () => {
    global.fetch = async () => {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as unknown as Response;
    };

    await assert.rejects(gateway.listModels('bad-key'), /TestProvider API error: 401 Unauthorized/);
  });

  test('listModels should use context_length from API response', async () => {
    const mockData = {
      data: [{ id: 'new-model', context_length: 1048576 }],
    };

    global.fetch = async () => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockData,
      } as unknown as Response;
    };

    const models = await gateway.listModels('key');
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0]?.id, 'new-model');
    assert.strictEqual(models[0]?.contextLength, 1048576);
  });

  test('listModels should handle models with display_name field', async () => {
    const mockData = {
      data: [{ id: 'model-v1', display_name: 'Model V1 (Latest)' }, { id: 'model-v2' }],
    };

    global.fetch = async () => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockData,
      } as unknown as Response;
    };

    const models = await gateway.listModels('key');
    assert.strictEqual(models.length, 2);
    const v1 = models.find((m: { id: string }) => m.id === 'model-v1');
    assert.strictEqual(v1?.name, 'Model V1 (Latest)');
    const v2 = models.find((m: { id: string }) => m.id === 'model-v2');
    assert.strictEqual(v2?.name, 'model-v2');
  });
});
