export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_OPENROUTER_ANTHROPIC_BASE_URL = 'https://openrouter.ai/api';
export const DEFAULT_CLOUDFLARE_BASE_URL = 'https://gateway.ai.cloudflare.com/v1';

export const PROVIDER_HOST_MAPPINGS: Record<string, string> = {
  'api.openai.com': 'OpenAI Official',
  'api.anthropic.com': 'Anthropic Official',
};
