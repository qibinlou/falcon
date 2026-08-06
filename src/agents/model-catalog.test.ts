import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { AgentLauncher } from './index.js';
import type { GatewayInstance } from '../gateways/index.js';
import { loadGatewayModelCatalog } from './model-catalog.js';

function fakeAgent(modelCatalogMode?: 'gateway'): AgentLauncher {
  return {
    name: 'Test Agent',
    slug: 'test',
    binaryName: 'test',
    installCommand: 'test',
    modelCatalogMode,
    async resolveConfig() {
      return { env: {} };
    },
    buildSpawnConfig() {
      return { command: 'test', args: [], env: {} };
    },
  };
}

function fakeGatewayInstance(): GatewayInstance {
  return {
    id: 'gw-openrouter-test',
    name: 'OpenRouter',
    apiKey: 'fake-key',
    fields: { OPENROUTER_API_KEY: 'fake-key', TEST_FIELD: 'test-value' },
    gateway: {
      name: 'OpenRouter',
      slug: 'openrouter',
      detectKey: () => undefined,
      async listModels(apiKey, fields) {
        assert.strictEqual(apiKey, 'fake-key');
        assert.strictEqual(fields?.TEST_FIELD, 'test-value');
        return [
          { id: 'vendor/model-a', name: 'Model A' },
          { id: 'vendor/model-b', name: 'Model B' },
        ];
      },
      getEnvConfig: () => ({ env: {} }),
    },
  };
}

describe('loadGatewayModelCatalog', () => {
  test('loads the full gateway catalog for agents that expose it in their UI', async () => {
    const models = await loadGatewayModelCatalog(fakeAgent('gateway'), fakeGatewayInstance());
    assert.deepStrictEqual(
      models?.map((model) => model.id),
      ['vendor/model-a', 'vendor/model-b'],
    );
  });

  test('does not fetch a catalog for other agents', async () => {
    const gateway = fakeGatewayInstance();
    gateway.gateway.listModels = async () => {
      throw new Error('must not be called');
    };
    assert.strictEqual(await loadGatewayModelCatalog(fakeAgent(), gateway), undefined);
  });

  test('falls back to the selected model when catalog loading fails', async () => {
    const gateway = fakeGatewayInstance();
    gateway.gateway.listModels = async () => {
      throw new Error('offline');
    };
    assert.strictEqual(await loadGatewayModelCatalog(fakeAgent('gateway'), gateway), undefined);
  });
});
