import assert from 'node:assert';
import { after, before, describe, test } from 'node:test';
import {
  clearModelMetadataCache,
  setLocalModelMetadataCache,
} from '../gateways/shared/modelEnricher.js';
import { getContextWindow, getModalities } from './codex-utils.js';

describe('Codex model metadata helpers', () => {
  before(() => {
    setLocalModelMetadataCache({
      'openai/gpt-4o': {
        contextLength: 123456,
        modalities: ['text', 'image'],
        pricing: { prompt: '$2.50/1M', completion: '$10.00/1M', promptPerM: 2.5 },
      },
      'gpt-4o': {
        contextLength: 123456,
        modalities: ['text', 'image'],
        pricing: { prompt: '$2.50/1M', completion: '$10.00/1M', promptPerM: 2.5 },
      },
      'deepseek/deepseek-v4-flash:free': {
        contextLength: 163840,
        modalities: ['text'],
        pricing: { prompt: '$0.00/1M', completion: '$0.00/1M', promptPerM: 0 },
      },
      'google/gemma-4-31b-it:free': {
        contextLength: 1000000,
        modalities: ['text', 'image', 'audio', 'video'],
        pricing: { prompt: '$0.00/1M', completion: '$0.00/1M', promptPerM: 0 },
      },
    });
  });

  after(() => {
    clearModelMetadataCache();
  });

  test('getContextWindow uses OpenRouter catalog metadata for exact model ids', async () => {
    assert.strictEqual(await getContextWindow('deepseek/deepseek-v4-flash:free'), 163840);
  });

  test('getModalities uses OpenRouter catalog metadata for normalized model ids', async () => {
    assert.deepStrictEqual(await getModalities('openai/gpt-4o'), ['text', 'image']);
  });

  test('getModalities filters out unsupported modalities like video or audio', async () => {
    assert.deepStrictEqual(await getModalities('google/gemma-4-31b-it:free'), ['text', 'image']);
  });
});
