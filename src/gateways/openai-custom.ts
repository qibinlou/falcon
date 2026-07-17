import { sortModels } from '../utils.js';
import { enrichModelInfo, fetchModelMetadataCatalog } from './shared/modelEnricher.js';
import type { Gateway, GatewayConfig, ModelInfo } from './index.js';

/**
 * Configuration for an OpenAI-compatible custom gateway.
 *
 * Any provider that exposes `/v1/models` and `/v1/chat/completions`
 * with Bearer-token auth can be added by supplying a config object.
 */
export interface OpenAICustomGatewayConfig {
  /** Display name shown in the TUI (e.g. "Kimi"). */
  name: string;

  /** CLI identifier / slug (e.g. "kimi"). */
  slug: string;

  /**
   * Base URL including the version path segment.
   * Example: "https://api.moonshot.ai/v1"
   */
  baseUrl: string;

  /**
   * Environment variable name that holds the API key.
   * Example: "MOONSHOT_API_KEY"
   */
  apiKeyEnvVar: string;

  /** Provider label attached to each ModelInfo (e.g. "Kimi"). */
  provider: string;

  /**
   * Optional filter applied to each model returned by the `/models` endpoint.
   * Return `true` to keep the model, `false` to exclude it.
   * Default: accept all models.
   */
  filterModel?: (model: { id: string; owned_by?: string }) => boolean;

  /**
   * Optional custom auth headers. When provided, these replace the
   * default `Authorization: Bearer <key>` header.
   */
  getAuthHeaders?: (apiKey: string) => Record<string, string>;
}

/**
 * A reusable Gateway implementation for any OpenAI-compatible provider.
 *
 * Instead of writing a full Gateway class for every provider, instantiate
 * (or extend) this class with an {@link OpenAICustomGatewayConfig}.
 *
 * @example
 * ```ts
 * // Minimal — just config, no subclass needed:
 * const kimi = new OpenAICustomGateway({
 *   name: 'Kimi',
 *   slug: 'kimi',
 *   baseUrl: 'https://api.moonshot.ai/v1',
 *   apiKeyEnvVar: 'MOONSHOT_API_KEY',
 *   provider: 'Kimi',
 * });
 *
 * // Or as a thin subclass for type-safe re-export:
 * class KimiGateway extends OpenAICustomGateway {
 *   constructor() {
 *     super({ ... });
 *   }
 * }
 * ```
 */
export class OpenAICustomGateway implements Gateway {
  readonly name: string;
  readonly slug: string;
  readonly apiKeyEnvVar: string;

  protected readonly config: OpenAICustomGatewayConfig;

  constructor(config: OpenAICustomGatewayConfig) {
    this.config = config;
    this.name = config.name;
    this.slug = config.slug;
    this.apiKeyEnvVar = config.apiKeyEnvVar;
  }

  detectKey(): string | undefined {
    return process.env[this.config.apiKeyEnvVar];
  }

  async listModels(apiKey: string, fields?: Record<string, string>): Promise<ModelInfo[]> {
    try {
      await fetchModelMetadataCatalog();
    } catch {
      // Ignore errors fetching metadata catalog, fallback to normal list
    }

    let baseUrl =
      fields?.OPENAI_COMPATIBLE_BASE_URL ||
      process.env.OPENAI_COMPATIBLE_BASE_URL ||
      this.config.baseUrl;
    baseUrl = baseUrl.replace(/(:\/\/|^)localhost(\/|:|$)/, '$1127.0.0.1$2');
    const url = baseUrl.endsWith('/') ? `${baseUrl}models` : `${baseUrl}/models`;

    const headers: Record<string, string> = this.config.getAuthHeaders
      ? this.config.getAuthHeaders(apiKey)
      : { Authorization: `Bearer ${apiKey}` };
    headers['Content-Type'] = 'application/json';

    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`${this.config.name} API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      data: Array<{
        id: string;
        display_name?: string;
        owned_by?: string;
        context_length?: number;
      }>;
    };

    let models = data.data.filter((m) => !!m.id);

    if (this.config.filterModel) {
      models = models.filter(this.config.filterModel);
    }

    return models
      .map(
        (m): ModelInfo =>
          enrichModelInfo({
            id: m.id,
            name: m.display_name || m.id,
            contextLength: m.context_length,
            provider: this.config.provider,
          }),
      )
      .sort(sortModels);
  }

  getEnvConfig(apiKey: string, _model: string, fields?: Record<string, string>): GatewayConfig {
    let baseUrl =
      fields?.OPENAI_COMPATIBLE_BASE_URL ||
      process.env.OPENAI_COMPATIBLE_BASE_URL ||
      this.config.baseUrl;
    baseUrl = baseUrl.replace(/(:\/\/|^)localhost(\/|:|$)/, '$1127.0.0.1$2');
    return {
      env: {
        // OpenAI-compatible env vars so downstream agents (Codex, Claude) can route through this gateway
        OPENAI_API_KEY: apiKey,
        OPENAI_BASE_URL: baseUrl,
        // Also set the provider's native env var
        [this.config.apiKeyEnvVar]: apiKey,
      },
      baseUrl,
    };
  }
}
