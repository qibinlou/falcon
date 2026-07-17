import { sortModels } from '../utils.js';
import { DEFAULT_ANTHROPIC_BASE_URL } from '../constants.js';
import { enrichModelInfo, fetchModelMetadataCatalog } from './shared/modelEnricher.js';
import type { Gateway, GatewayConfig, ModelInfo } from './index.js';

// use 'claude-haiku-4-5' for simple and cheap testing
export class AnthropicGateway implements Gateway {
  name = 'Anthropic';
  slug = 'anthropic';
  apiKeyEnvVar = 'ANTHROPIC_API_KEY';

  detectKey(): string | undefined {
    return process.env['ANTHROPIC_API_KEY'];
  }

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    try {
      await fetchModelMetadataCatalog();
    } catch {
      // Ignore errors fetching metadata catalog, fallback to normal list
    }

    const baseUrl = process.env.ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE_URL;
    let url = baseUrl;
    if (!url.includes('/v1') && !url.includes('/v2')) {
      url = url.endsWith('/') ? `${url}v1/models` : `${url}/v1/models`;
    } else {
      url = url.endsWith('/') ? `${url}models` : `${url}/models`;
    }

    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      data: Array<{
        id: string;
        display_name?: string;
        context_window?: number;
      }>;
    };

    return data.data
      .map((m) =>
        enrichModelInfo({
          id: m.id,
          name: m.display_name || m.id,
          contextLength: m.context_window,
          provider: 'Anthropic',
        }),
      )
      .sort(sortModels);
  }

  getEnvConfig(apiKey: string, _model: string): GatewayConfig {
    return {
      env: {
        ANTHROPIC_API_KEY: apiKey,
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE_URL,
      },
    };
  }
}
