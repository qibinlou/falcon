import { OpenAICustomGateway } from './openai-custom.js';

/**
 * OpenAI Compatible custom gateway (e.g., Ollama, LM Studio, local endpoints).
 *
 * Allows users to configure a custom endpoint, name, and optional API key.
 */
export class OpenAICompatibleGateway extends OpenAICustomGateway {
  constructor() {
    super({
      name: 'OpenAI Compatible',
      slug: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1', // default fallback base URL
      apiKeyEnvVar: 'OPENAI_COMPATIBLE_API_KEY',
      provider: 'Custom',
    });
  }
}
