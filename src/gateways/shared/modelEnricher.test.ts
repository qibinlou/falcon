import assert from 'node:assert';
import { after, before, describe, test } from 'node:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  normalizeModelId,
  enrichModelWithCatalog,
  enrichModelInfo,
  fetchModelMetadataCatalog,
  setLocalModelMetadataCache,
  clearModelMetadataCache,
} from './modelEnricher.js';
import type { ModelInfo } from '../index.js';

describe('Model ID Normalization', () => {
  test('should strip provider prefixes', () => {
    assert.strictEqual(normalizeModelId('openai/gpt-4o'), 'gpt-4o');
    assert.strictEqual(normalizeModelId('anthropic/claude-3-5-sonnet'), 'claude-3-5-sonnet');
    assert.strictEqual(normalizeModelId('deepseek/deepseek-chat'), 'deepseek-chat');
  });

  test('should strip tag/version suffixes', () => {
    assert.strictEqual(normalizeModelId('gpt-4o:free'), 'gpt-4o');
    assert.strictEqual(normalizeModelId('openai/gpt-4o:free'), 'gpt-4o');
    assert.strictEqual(normalizeModelId('claude-3-5-sonnet:beta'), 'claude-3-5-sonnet');
  });

  test('should strip date suffixes', () => {
    assert.strictEqual(normalizeModelId('claude-3-5-sonnet-20241022'), 'claude-3-5-sonnet');
    assert.strictEqual(normalizeModelId('claude-3-opus-20240229'), 'claude-3-opus');
    assert.strictEqual(normalizeModelId('gpt-4o-2024-05-13'), 'gpt-4o');
    assert.strictEqual(normalizeModelId('gpt-4-0613'), 'gpt-4');
  });

  test('should strip -latest suffix', () => {
    assert.strictEqual(normalizeModelId('claude-3-5-sonnet-latest'), 'claude-3-5-sonnet');
    assert.strictEqual(normalizeModelId('claude-3-5-sonnet-20241022-latest'), 'claude-3-5-sonnet');
  });

  test('should convert dots and underscores to hyphens and collapse multiple hyphens', () => {
    assert.strictEqual(normalizeModelId('gpt-3.5-turbo'), 'gpt-3-5-turbo');
    assert.strictEqual(normalizeModelId('gpt_4o_mini'), 'gpt-4o-mini');
    assert.strictEqual(normalizeModelId('some..model__name'), 'some-model-name');
  });
});

describe('Model Enrichment', () => {
  const mockCatalog = {
    'gpt-4o': {
      contextLength: 128000,
      modalities: ['text', 'image'],
      pricing: {
        prompt: '$2.50/1M',
        completion: '$10.00/1M',
        promptPerM: 2.5,
      },
    },
    'claude-3-5-sonnet': {
      contextLength: 200000,
      pricing: {
        prompt: '$3.00/1M',
        completion: '$15.00/1M',
        promptPerM: 3.0,
      },
    },
    'gpt-3-5-turbo': {
      contextLength: 16385,
      pricing: {
        prompt: '$0.50/1M',
        completion: '$1.50/1M',
        promptPerM: 0.5,
      },
    },
  };

  test('enrichModelWithCatalog should match exact id', () => {
    const model: ModelInfo = { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' };
    const enriched = enrichModelWithCatalog(model, mockCatalog);
    assert.strictEqual(enriched.contextLength, 128000);
    assert.strictEqual(enriched.pricing?.prompt, '$2.50/1M');
  });

  test('enrichModelWithCatalog should match normalized id', () => {
    const model: ModelInfo = {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      provider: 'Anthropic',
    };
    const enriched = enrichModelWithCatalog(model, mockCatalog);
    assert.strictEqual(enriched.contextLength, 200000);
    assert.strictEqual(enriched.pricing?.prompt, '$3.00/1M');
  });

  test('enrichModelWithCatalog should match id with dots', () => {
    const model: ModelInfo = { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI' };
    const enriched = enrichModelWithCatalog(model, mockCatalog);
    assert.strictEqual(enriched.contextLength, 16385);
    assert.strictEqual(enriched.pricing?.prompt, '$0.50/1M');
  });

  test('enrichModelWithCatalog should preserve existing model values', () => {
    const model: ModelInfo = {
      id: 'gpt-4o',
      name: 'GPT-4o Custom',
      provider: 'OpenAI',
      contextLength: 9999,
      pricing: { prompt: '$9.99/1M', completion: '$9.99/1M', promptPerM: 9.99 },
    };
    const enriched = enrichModelWithCatalog(model, mockCatalog);
    assert.strictEqual(enriched.contextLength, 9999);
    assert.strictEqual(enriched.pricing?.prompt, '$9.99/1M');
  });

  describe('Global Metadata Cache Enrichment', () => {
    before(() => {
      setLocalModelMetadataCache(mockCatalog);
    });

    after(() => {
      clearModelMetadataCache();
    });

    test('enrichModelInfo should use global cache to enrich models', () => {
      const model: ModelInfo = {
        id: 'claude-3-5-sonnet-latest',
        name: 'Claude Latest',
        provider: 'Anthropic',
      };
      const enriched = enrichModelInfo(model);
      assert.strictEqual(enriched.contextLength, 200000);
      assert.strictEqual(enriched.pricing?.prompt, '$3.00/1M');
    });
  });
});

describe('OpenRouter Catalog Cache', () => {
  let tempDir: string;
  let originalFetch: typeof global.fetch;
  let originalCachePath: string | undefined;
  let originalAllowFetch: string | undefined;

  before(() => {
    originalFetch = global.fetch;
    originalCachePath = process.env.FALCON_MODEL_METADATA_CACHE_PATH;
    originalAllowFetch = process.env.FALCON_ALLOW_MODEL_METADATA_FETCH_IN_TESTS;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-model-cache-'));
    process.env.FALCON_MODEL_METADATA_CACHE_PATH = path.join(tempDir, 'openrouter-models.json');
    process.env.FALCON_ALLOW_MODEL_METADATA_FETCH_IN_TESTS = '1';
  });

  after(() => {
    global.fetch = originalFetch;
    clearModelMetadataCache();
    if (originalCachePath !== undefined) {
      process.env.FALCON_MODEL_METADATA_CACHE_PATH = originalCachePath;
    } else {
      delete process.env.FALCON_MODEL_METADATA_CACHE_PATH;
    }
    if (originalAllowFetch !== undefined) {
      process.env.FALCON_ALLOW_MODEL_METADATA_FETCH_IN_TESTS = originalAllowFetch;
    } else {
      delete process.env.FALCON_ALLOW_MODEL_METADATA_FETCH_IN_TESTS;
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('fetchModelMetadataCatalog parses context and modalities and reuses disk cache', async () => {
    let fetchCalls = 0;
    global.fetch = async (url: RequestInfo | URL) => {
      fetchCalls += 1;
      assert.strictEqual(url, 'https://openrouter.ai/api/v1/models');
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'openai/gpt-4o',
              context_length: 123456,
              architecture: { input_modalities: ['text', 'image', 'text'] },
              pricing: { prompt: '0.0000025', completion: '0.00001' },
            },
          ],
        }),
      } as unknown as Response;
    };

    clearModelMetadataCache();
    const firstCatalog = await fetchModelMetadataCatalog();
    assert.strictEqual(firstCatalog['openai/gpt-4o']?.contextLength, 123456);
    assert.deepStrictEqual(firstCatalog['gpt-4o']?.modalities, ['text', 'image']);
    assert.strictEqual(fetchCalls, 1);

    clearModelMetadataCache();
    global.fetch = async () => {
      throw new Error('fresh disk cache should avoid remote fetch');
    };

    const secondCatalog = await fetchModelMetadataCatalog();
    assert.strictEqual(secondCatalog['gpt-4o']?.contextLength, 123456);
    assert.deepStrictEqual(secondCatalog['gpt-4o']?.modalities, ['text', 'image']);
    assert.strictEqual(fetchCalls, 1);
  });
});
