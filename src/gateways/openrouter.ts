import {
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_ANTHROPIC_BASE_URL,
} from '../constants.js';
import { formatPricePerM, sortModels } from '../utils.js';
import type { Gateway, GatewayConfig, ModelInfo } from './index.js';

export class OpenRouterGateway implements Gateway {
  name = 'OpenRouter';
  slug = 'openrouter';
  apiKeyEnvVar = 'OPENROUTER_API_KEY';

  detectKey(): string | undefined {
    return process.env['OPENROUTER_API_KEY'];
  }

  async listModels(apiKey: string): Promise<ModelInfo[]> {
    const res = await fetch(`${DEFAULT_OPENROUTER_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`OpenRouter API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      data: Array<{
        id: string;
        name: string;
        context_length?: number;
        pricing?: { prompt: string; completion: string };
        created?: number;
      }>;
    };

    return data.data
      .filter((m) => m.id && m.name)
      .map((m) => {
        const promptRaw = parseFloat(m.pricing?.prompt ?? '0');
        const completionRaw = parseFloat(m.pricing?.completion ?? '0');
        const promptPerM = promptRaw * 1_000_000;
        const completionPerM = completionRaw * 1_000_000;
        return {
          id: m.id,
          name: m.name,
          contextLength: m.context_length,
          pricing: m.pricing
            ? {
                prompt: formatPricePerM(promptPerM),
                completion: formatPricePerM(completionPerM),
                promptPerM,
              }
            : undefined,
          provider: 'OpenRouter',
          created: m.created,
        };
      })
      .sort(sortModels);
  }

  getEnvConfig(apiKey: string, _model: string): GatewayConfig {
    return {
      env: {
        OPENROUTER_API_KEY: apiKey,

        OPENAI_API_KEY: apiKey,
        OPENAI_BASE_URL: DEFAULT_OPENROUTER_BASE_URL,

        ANTHROPIC_API_KEY: apiKey,
        ANTHROPIC_BASE_URL: DEFAULT_OPENROUTER_ANTHROPIC_BASE_URL,
      },
      baseUrl: DEFAULT_OPENROUTER_BASE_URL,
    };
  }
}
