import assert from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { OpenAICompatibleGateway } from './openai-compatible.js';
import { setLocalModelMetadataCache, clearModelMetadataCache } from './shared/modelEnricher.js';

describe('OpenAI Compatible Gateway', () => {
  const gateway = new OpenAICompatibleGateway();
  let originalFetch: typeof global.fetch;

  before(() => {
    originalFetch = global.fetch;
    setLocalModelMetadataCache({});
  });

  after(() => {
    global.fetch = originalFetch;
    clearModelMetadataCache();
  });

  test('should have correct name and slug', () => {
    assert.strictEqual(gateway.name, 'OpenAI Compatible');
    assert.strictEqual(gateway.slug, 'openai-compatible');
  });

  test('getEnvConfig should read custom base URL and provider name from fields and normalize localhost', () => {
    const config = gateway.getEnvConfig('custom-key-123', 'some-model', {
      OPENAI_COMPATIBLE_BASE_URL: 'http://localhost:8000/v1',
      OPENAI_COMPATIBLE_NAME: 'MyLocalLLM',
    });
    assert.deepStrictEqual(config, {
      env: {
        OPENAI_API_KEY: 'custom-key-123',
        OPENAI_BASE_URL: 'http://127.0.0.1:8000/v1',
        OPENAI_COMPATIBLE_API_KEY: 'custom-key-123',
      },
      baseUrl: 'http://127.0.0.1:8000/v1',
    });
  });

  test('listModels should temporarily override base URL when environment has OPENAI_COMPATIBLE_BASE_URL and normalize localhost', async () => {
    const mockData = {
      data: [{ id: 'custom-model-1', context_length: 4096 }],
    };

    // Set env var as withGatewayEnvAsync would do
    process.env.OPENAI_COMPATIBLE_BASE_URL = 'http://localhost:8080/v1';

    global.fetch = async (url: RequestInfo | URL) => {
      assert.strictEqual(url, 'http://127.0.0.1:8080/v1/models');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockData,
      } as unknown as Response;
    };

    try {
      const models = await gateway.listModels('custom-key');
      assert.strictEqual(models.length, 1);
      assert.strictEqual(models[0]?.id, 'custom-model-1');
      assert.strictEqual(models[0]?.contextLength, 4096);
    } finally {
      delete process.env.OPENAI_COMPATIBLE_BASE_URL;
    }
  });
});
