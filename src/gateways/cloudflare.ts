import { DEFAULT_CLOUDFLARE_BASE_URL } from '../constants.js';
import type { Gateway, GatewayConfig, ModelInfo } from './index.js';

// TODO: implement and test this
export class CloudflareGateway implements Gateway {
  name = 'Cloudflare AI Gateway';
  slug = 'cloudflare';

  detectKey(): string | undefined {
    return process.env['CLOUDFLARE_API_KEY'] || process.env['CF_API_KEY'];
  }

  private getAccountId(): string {
    return process.env['CLOUDFLARE_ACCOUNT_ID'] || process.env['CF_ACCOUNT_ID'] || '';
  }

  private getGatewayId(): string {
    return process.env['CLOUDFLARE_GATEWAY_ID'] || process.env['CF_GATEWAY_ID'] || 'default';
  }

  async listModels(_apiKey: string): Promise<ModelInfo[]> {
    // Cloudflare AI Gateway proxies to other providers,
    // so we return common models it can route to
    return [
      { id: 'gpt-4o', name: 'GPT-4o (via CF Gateway)', provider: 'Cloudflare' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (via CF Gateway)', provider: 'Cloudflare' },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4 (via CF Gateway)',
        provider: 'Cloudflare',
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku (via CF Gateway)',
        provider: 'Cloudflare',
      },
    ];
  }

  getEnvConfig(apiKey: string, _model: string): GatewayConfig {
    const accountId = this.getAccountId();
    const gatewayId = this.getGatewayId();
    const baseUrl = accountId
      ? `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/openai`
      : DEFAULT_CLOUDFLARE_BASE_URL;

    return {
      env: {
        OPENAI_API_KEY: apiKey,
        OPENAI_BASE_URL: baseUrl,
      },
      baseUrl,
    };
  }
}
