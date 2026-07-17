import { DEFAULT_KIMI_BASE_URL } from '../constants.js';
import { OpenAICustomGateway } from './openai-custom.js';

/**
 * Kimi (Moonshot AI) gateway.
 *
 * Kimi provides an OpenAI-compatible API at `https://api.moonshot.ai/v1`.
 * Models include kimi-k3 (2.8T params, 1M context), kimi-k2.7-code, kimi-k2.6, etc.
 *
 * Environment variable: `MOONSHOT_API_KEY`
 *
 * @see https://platform.kimi.ai/docs/api/overview.md
 */
export class KimiGateway extends OpenAICustomGateway {
  constructor() {
    super({
      name: 'Kimi',
      slug: 'kimi',
      baseUrl: DEFAULT_KIMI_BASE_URL,
      apiKeyEnvVar: 'MOONSHOT_API_KEY',
      provider: 'Kimi',
    });
  }
}
