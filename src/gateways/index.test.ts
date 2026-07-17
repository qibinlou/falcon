import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import {
  ALL_GATEWAYS,
  detectGateways,
  getGatewayInstanceLabel,
  detectGatewayInstances,
  type Gateway,
} from './index.js';

describe('Gateways Registry', () => {
  let originalEnv: Record<string, string | undefined>;

  before(() => {
    originalEnv = { ...process.env };
    process.env.FALCON_CONFIG_FILE = path.join(os.tmpdir(), 'non-existent-falcon-config.json');
  });

  after(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  });

  test('ALL_GATEWAYS should contain standard gateways', () => {
    assert.ok(ALL_GATEWAYS.length >= 6);
    const slugs = ALL_GATEWAYS.map((g) => g.slug);
    assert.ok(slugs.includes('openrouter'));
    assert.ok(slugs.includes('openai'));
    assert.ok(slugs.includes('anthropic'));
    assert.ok(slugs.includes('cloudflare'));
    assert.ok(slugs.includes('kimi'));
    assert.ok(slugs.includes('openai-compatible'));
  });

  test('detectGateways should return empty array if no keys are set', () => {
    // Clear relevant environment variables
    delete process.env['OPENROUTER_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CLOUDFLARE_API_KEY'];
    delete process.env['CF_API_KEY'];
    delete process.env['MOONSHOT_API_KEY'];

    const detected = detectGateways();
    assert.strictEqual(detected.length, 0);
  });

  test('detectGateways should detect single gateway when key is set', () => {
    delete process.env['OPENROUTER_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['CLOUDFLARE_API_KEY'];
    delete process.env['CF_API_KEY'];
    delete process.env['MOONSHOT_API_KEY'];

    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-testkey';

    const detected = detectGateways();
    assert.strictEqual(detected.length, 1);
    assert.strictEqual(detected[0]?.gateway.slug, 'anthropic');
    assert.strictEqual(detected[0]?.apiKey, 'sk-ant-testkey');
  });

  test('detectGateways should detect multiple gateways', () => {
    delete process.env['OPENROUTER_API_KEY'];
    delete process.env['CLOUDFLARE_API_KEY'];
    delete process.env['CF_API_KEY'];
    delete process.env['MOONSHOT_API_KEY'];

    process.env['OPENAI_API_KEY'] = 'sk-openai-key';
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-key';

    const detected = detectGateways();
    assert.strictEqual(detected.length, 2);

    const slugs = detected.map((d) => d.gateway.slug);
    assert.ok(slugs.includes('openai'));
    assert.ok(slugs.includes('anthropic'));
  });

  test('detectGateways should detect Kimi gateway via MOONSHOT_API_KEY', () => {
    delete process.env['OPENROUTER_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['CLOUDFLARE_API_KEY'];
    delete process.env['CF_API_KEY'];

    process.env['MOONSHOT_API_KEY'] = 'sk-moonshot-test';

    const detected = detectGateways();
    assert.strictEqual(detected.length, 1);
    assert.strictEqual(detected[0]?.gateway.slug, 'kimi');
    assert.strictEqual(detected[0]?.apiKey, 'sk-moonshot-test');

    delete process.env['MOONSHOT_API_KEY'];
  });

  test('getGatewayInstanceLabel should map official hosts to readable names', () => {
    // Official OpenAI
    const openAiLabel1 = getGatewayInstanceLabel('openai', {
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
    });
    assert.strictEqual(openAiLabel1, 'OpenAI Official');

    // Official Anthropic
    const anthropicLabel1 = getGatewayInstanceLabel('anthropic', {
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
    });
    assert.strictEqual(anthropicLabel1, 'Anthropic Official');

    // Custom host
    const openAiLabel2 = getGatewayInstanceLabel('openai', {
      OPENAI_BASE_URL: 'localhost:11434',
    });
    assert.strictEqual(openAiLabel2, 'OpenAI@localhost:11434');

    // Cloudflare
    const cfLabel = getGatewayInstanceLabel('cloudflare', {
      CLOUDFLARE_ACCOUNT_ID: 'my-cf-acc',
    });
    assert.strictEqual(cfLabel, 'Cloudflare@my-cf-acc');
  });

  test('detectGatewayInstances should dynamically extract apiKey based on apiKeyEnvVar', async () => {
    // Create a mock custom gateway
    const mockCustomGateway: Gateway = {
      name: 'Custom mock',
      slug: 'custom-mock',
      apiKeyEnvVar: 'CUSTOM_MOCK_API_KEY',
      detectKey() {
        return undefined;
      },
      async listModels() {
        return [];
      },
      getEnvConfig() {
        return { env: {} };
      },
    };

    ALL_GATEWAYS.push(mockCustomGateway);

    // Save a config with fields for this gateway
    const configPath = path.join(os.tmpdir(), 'test-custom-gateway-config.json');
    const oldConfig = process.env.FALCON_CONFIG_FILE;
    process.env.FALCON_CONFIG_FILE = configPath;

    const { saveFalconConfigV2 } = await import('../config.js');
    saveFalconConfigV2({
      version: 2,
      gateways: [
        {
          id: 'test-custom',
          gatewaySlug: 'custom-mock',
          fields: {
            CUSTOM_MOCK_API_KEY: 'secret-custom-key',
          },
        },
      ],
    });

    try {
      const instances = detectGatewayInstances();
      const customInst = instances.find((i) => i.gateway.slug === 'custom-mock');
      assert.ok(customInst);
      assert.strictEqual(customInst.apiKey, 'secret-custom-key');
    } finally {
      ALL_GATEWAYS.pop();
      try {
        fs.unlinkSync(configPath);
      } catch {}
      if (oldConfig) {
        process.env.FALCON_CONFIG_FILE = oldConfig;
      } else {
        delete process.env.FALCON_CONFIG_FILE;
      }
    }
  });
});
