import assert from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { KimiGateway } from './kimi.js';
import { setLocalModelMetadataCache, clearModelMetadataCache } from './shared/modelEnricher.js';

describe('Kimi Gateway', () => {
  const gateway = new KimiGateway();
  let originalApiKey: string | undefined;
  let originalFetch: typeof global.fetch;

  before(() => {
    originalApiKey = process.env['MOONSHOT_API_KEY'];
    originalFetch = global.fetch;
    delete process.env['MOONSHOT_API_KEY'];

    setLocalModelMetadataCache({});
  });

  after(() => {
    global.fetch = originalFetch;
    clearModelMetadataCache();
    if (originalApiKey !== undefined) {
      process.env['MOONSHOT_API_KEY'] = originalApiKey;
    } else {
      delete process.env['MOONSHOT_API_KEY'];
    }
  });

  test('should have correct name and slug', () => {
    assert.strictEqual(gateway.name, 'Kimi');
    assert.strictEqual(gateway.slug, 'kimi');
  });

  test('detectKey should return MOONSHOT_API_KEY', () => {
    process.env['MOONSHOT_API_KEY'] = 'sk-moonshot-test';
    assert.strictEqual(gateway.detectKey(), 'sk-moonshot-test');

    delete process.env['MOONSHOT_API_KEY'];
    assert.strictEqual(gateway.detectKey(), undefined);
  });

  test('getEnvConfig should set OPENAI_API_KEY, OPENAI_BASE_URL, and MOONSHOT_API_KEY', () => {
    const config = gateway.getEnvConfig('moonshot-key-123', 'kimi-k3');
    assert.deepStrictEqual(config, {
      env: {
        OPENAI_API_KEY: 'moonshot-key-123',
        OPENAI_BASE_URL: 'https://api.moonshot.ai/v1',
        MOONSHOT_API_KEY: 'moonshot-key-123',
      },
      baseUrl: 'https://api.moonshot.ai/v1',
    });
  });

  test('listModels should fetch from Kimi API and return models', async () => {
    const mockData = {
      data: [
        { id: 'kimi-k3', context_length: 1048576 },
        { id: 'kimi-k2.7-code', context_length: 262144 },
        { id: 'kimi-k2.6', context_length: 262144 },
      ],
    };

    global.fetch = async (url: RequestInfo | URL, options?: RequestInit) => {
      assert.strictEqual(url, 'https://api.moonshot.ai/v1/models');
      const headers = options?.headers as Record<string, string> | undefined;
      assert.strictEqual(headers?.['Authorization'], 'Bearer moonshot-key');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockData,
      } as unknown as Response;
    };

    const models = await gateway.listModels('moonshot-key');
    assert.strictEqual(models.length, 3);
    assert.ok(models.every((m: { provider?: string }) => m.provider === 'Kimi'));

    const k3 = models.find((m: { id: string }) => m.id === 'kimi-k3');
    assert.ok(k3);
    assert.strictEqual(k3.contextLength, 1048576);
  });

  test('listModels should throw error on API failure', async () => {
    global.fetch = async () => {
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as unknown as Response;
    };

    await assert.rejects(gateway.listModels('bad-key'), /Kimi API error: 401 Unauthorized/);
  });
});
