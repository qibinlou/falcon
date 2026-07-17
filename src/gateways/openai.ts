import { sortModels } from '../utils.js';
import { DEFAULT_OPENAI_BASE_URL } from '../constants.js';
import { enrichModelInfo, fetchModelMetadataCatalog } from './shared/modelEnricher.js';
import type { Gateway, GatewayConfig, ModelInfo } from './index.js';

export class OpenAIGateway implements Gateway {
  name = 'OpenAI';
  slug = 'openai';
  apiKeyEnvVar = 'OPENAI_API_KEY';

  detectKey(): string | undefined {
    return process.env['OPENAI_API_KEY'];
  }

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    try {
      await fetchModelMetadataCatalog();
    } catch {
      // Ignore errors fetching metadata catalog, fallback to normal list
    }

    const baseUrl = process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL;
    let url = baseUrl;
    if (!url.includes('/v1') && !url.includes('/v2')) {
      url = url.endsWith('/') ? `${url}v1/models` : `${url}/v1/models`;
    } else {
      url = url.endsWith('/') ? `${url}models` : `${url}/models`;
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      data: Array<{ id: string; owned_by?: string }>;
    };

    // Filter to likely useful models (GPT, o-series, etc.)
    const useful = data.data
      .filter((m) => {
        const id = m.id.toLowerCase();
        return (
          id.includes('gpt') ||
          id.includes('o1') ||
          id.includes('o3') ||
          id.includes('o4') ||
          id.includes('codex') ||
          id.startsWith('chatgpt')
        );
      })
      .map(
        (m): ModelInfo =>
          enrichModelInfo({
            id: m.id,
            name: m.id,
            provider: 'OpenAI',
          }),
      )
      .sort(sortModels);

    return useful;
  }

  getEnvConfig(apiKey: string, _model: string): GatewayConfig {
    const config: GatewayConfig = {
      env: {
        OPENAI_API_KEY: apiKey,
      },
    };
    if (process.env.OPENAI_BASE_URL) {
      config.env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
    }
    return config;
  }
}
