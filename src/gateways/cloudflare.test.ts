import assert from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { CloudflareGateway } from './cloudflare.js';

describe('Cloudflare Gateway', () => {
  const gateway = new CloudflareGateway();
  let originalEnv: Record<string, string | undefined>;

  before(() => {
    originalEnv = {
      CLOUDFLARE_API_KEY: process.env['CLOUDFLARE_API_KEY'],
      CF_API_KEY: process.env['CF_API_KEY'],
      CLOUDFLARE_ACCOUNT_ID: process.env['CLOUDFLARE_ACCOUNT_ID'],
      CF_ACCOUNT_ID: process.env['CF_ACCOUNT_ID'],
      CLOUDFLARE_GATEWAY_ID: process.env['CLOUDFLARE_GATEWAY_ID'],
      CF_GATEWAY_ID: process.env['CF_GATEWAY_ID'],
    };
  });

  after(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  test('should have correct name and slug', () => {
    assert.strictEqual(gateway.name, 'Cloudflare AI Gateway');
    assert.strictEqual(gateway.slug, 'cloudflare');
  });

  test('detectKey should return the environment variable', () => {
    delete process.env['CF_API_KEY'];
    process.env['CLOUDFLARE_API_KEY'] = 'cf-key-1';
    assert.strictEqual(gateway.detectKey(), 'cf-key-1');

    delete process.env['CLOUDFLARE_API_KEY'];
    process.env['CF_API_KEY'] = 'cf-key-2';
    assert.strictEqual(gateway.detectKey(), 'cf-key-2');

    delete process.env['CF_API_KEY'];
    assert.strictEqual(gateway.detectKey(), undefined);
  });

  test('listModels should return predefined proxy models', async () => {
    const models = await gateway.listModels('any-key');
    assert.ok(Array.isArray(models));
    assert.strictEqual(models.length, 4);
    assert.ok(models.some((m) => m.id === 'gpt-4o'));
  });

  test('getEnvConfig should fallback if account ID is not set', () => {
    delete process.env['CLOUDFLARE_ACCOUNT_ID'];
    delete process.env['CF_ACCOUNT_ID'];

    const config = gateway.getEnvConfig('test-key', 'any-model');
    assert.deepStrictEqual(config, {
      env: {
        OPENAI_API_KEY: 'test-key',
        OPENAI_BASE_URL: 'https://gateway.ai.cloudflare.com/v1',
      },
      baseUrl: 'https://gateway.ai.cloudflare.com/v1',
    });
  });

  test('getEnvConfig should construct URL using account and gateway IDs', () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'my-account';
    process.env['CLOUDFLARE_GATEWAY_ID'] = 'my-gateway';

    const config = gateway.getEnvConfig('test-key', 'any-model');
    assert.deepStrictEqual(config, {
      env: {
        OPENAI_API_KEY: 'test-key',
        OPENAI_BASE_URL: 'https://gateway.ai.cloudflare.com/v1/my-account/my-gateway/openai',
      },
      baseUrl: 'https://gateway.ai.cloudflare.com/v1/my-account/my-gateway/openai',
    });
  });
});
