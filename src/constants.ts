import os from 'node:os';
import path from 'node:path';

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_OPENROUTER_ANTHROPIC_BASE_URL = 'https://openrouter.ai/api';
export const DEFAULT_CLOUDFLARE_BASE_URL = 'https://gateway.ai.cloudflare.com/v1';

export const PROVIDER_HOST_MAPPINGS: Record<string, string> = {
  'api.openai.com': 'OpenAI Official',
  'api.anthropic.com': 'Anthropic Official',
};

// Workspace and Agent Environment Keys
export const ENV_FALCON_DIR = 'FALCON_DIR';
export const ENV_CLAUDE_CONFIG_DIR = 'CLAUDE_CONFIG_DIR';
export const ENV_CODEX_HOME = 'CODEX_HOME';
export const ENV_OPENCODE_CONFIG_DIR = 'OPENCODE_CONFIG_DIR';
export const ENV_FALCON_CONFIG_FILE = 'FALCON_CONFIG_FILE';

// Workspace Default Paths
export const DEFAULT_FALCON_DIR = path.join(os.homedir(), '.falcon');
