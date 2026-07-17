// Gateway types and auto-detection

export interface ModelInfo {
  id: string;
  name: string;
  contextLength?: number;
  pricing?: {
    prompt: string; // raw per-token cost string from provider
    completion: string;
    promptPerM?: number; // cost per 1M tokens, numeric
  };
  provider?: string;
  created?: number; // Unix timestamp for recency sorting
  gatewayInstance?: GatewayInstance;
}

export interface GatewayConfig {
  env: Record<string, string>;
  baseUrl?: string;
}

export interface Gateway {
  name: string;
  slug: string;
  // API key env var name, e.g. OPENAI_API_KEY
  apiKeyEnvVar?: string;
  detectKey(): string | undefined;
  listModels(apiKey: string, fields?: Record<string, string>): Promise<ModelInfo[]>;
  getEnvConfig(apiKey: string, model: string, fields?: Record<string, string>): GatewayConfig;
}

export { AnthropicGateway } from './anthropic.js';
export { CloudflareGateway } from './cloudflare.js';
export { KimiGateway } from './kimi.js';
export { OpenAICompatibleGateway } from './openai-compatible.js';
export { OpenAICustomGateway } from './openai-custom.js';
export type { OpenAICustomGatewayConfig } from './openai-custom.js';
export { OpenAIGateway } from './openai.js';
export { OpenRouterGateway } from './openrouter.js';

import { AnthropicGateway } from './anthropic.js';
import { CloudflareGateway } from './cloudflare.js';
import { KimiGateway } from './kimi.js';
import { OpenAICompatibleGateway } from './openai-compatible.js';
import { OpenAIGateway } from './openai.js';
import { OpenRouterGateway } from './openrouter.js';
import { loadFalconConfigV2 } from '../config.js';
import {
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_ANTHROPIC_BASE_URL,
  PROVIDER_HOST_MAPPINGS,
} from '../constants.js';

export const ALL_GATEWAYS: Gateway[] = [
  new OpenRouterGateway(),
  new OpenAIGateway(),
  new AnthropicGateway(),
  new CloudflareGateway(),
  new KimiGateway(),
  new OpenAICompatibleGateway(),
];

export interface GatewayInstance {
  id: string;
  gateway: Gateway;
  name: string;
  apiKey: string;
  fields: Record<string, string>;
  isEnv?: boolean;
}

export function getGatewayInstanceLabel(
  gatewaySlug: string,
  fields: Record<string, string>,
): string {
  if (gatewaySlug === 'openai') {
    const baseUrl = fields.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL;
    try {
      const url = baseUrl.includes('://') ? baseUrl : `http://${baseUrl}`;
      const parsed = new URL(url);
      if (PROVIDER_HOST_MAPPINGS[parsed.host]) {
        return PROVIDER_HOST_MAPPINGS[parsed.host];
      }
      return `OpenAI@${parsed.host}`;
    } catch {
      return `OpenAI@${baseUrl}`;
    }
  }
  if (gatewaySlug === 'anthropic') {
    const baseUrl = fields.ANTHROPIC_BASE_URL || DEFAULT_ANTHROPIC_BASE_URL;
    try {
      const url = baseUrl.includes('://') ? baseUrl : `http://${baseUrl}`;
      const parsed = new URL(url);
      if (PROVIDER_HOST_MAPPINGS[parsed.host]) {
        return PROVIDER_HOST_MAPPINGS[parsed.host];
      }
      return `Anthropic@${parsed.host}`;
    } catch {
      return `Anthropic@${baseUrl}`;
    }
  }
  if (gatewaySlug === 'openrouter') {
    return 'OpenRouter';
  }
  if (gatewaySlug === 'kimi') {
    return 'Kimi';
  }
  if (gatewaySlug === 'openai-compatible') {
    return fields.OPENAI_COMPATIBLE_NAME || 'OpenAI Compatible';
  }
  if (gatewaySlug === 'cloudflare') {
    const accountId = fields.CLOUDFLARE_ACCOUNT_ID || fields.CF_ACCOUNT_ID;
    return accountId ? `Cloudflare@${accountId}` : 'Cloudflare AI Gateway';
  }
  const gw = ALL_GATEWAYS.find((g) => g.slug === gatewaySlug);
  return gw ? gw.name : gatewaySlug;
}

export function detectGatewayInstances(): GatewayInstance[] {
  const instances: GatewayInstance[] = [];

  // 1. System environment variables
  if (process.env.OPENROUTER_API_KEY) {
    const gw = ALL_GATEWAYS.find((g) => g.slug === 'openrouter') as Gateway;
    instances.push({
      id: 'env-openrouter',
      gateway: gw,
      name: 'OpenRouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      fields: { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY },
      isEnv: true,
    });
  }

  if (process.env.OPENAI_API_KEY) {
    const gw = ALL_GATEWAYS.find((g) => g.slug === 'openai') as Gateway;
    const fields: Record<string, string> = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };
    if (process.env.OPENAI_BASE_URL) {
      fields.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
    }
    instances.push({
      id: 'env-openai',
      gateway: gw,
      name: getGatewayInstanceLabel('openai', fields),
      apiKey: process.env.OPENAI_API_KEY,
      fields,
      isEnv: true,
    });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const gw = ALL_GATEWAYS.find((g) => g.slug === 'anthropic') as Gateway;
    const fields: Record<string, string> = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    };
    if (process.env.ANTHROPIC_BASE_URL) {
      fields.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
    }
    instances.push({
      id: 'env-anthropic',
      gateway: gw,
      name: getGatewayInstanceLabel('anthropic', fields),
      apiKey: process.env.ANTHROPIC_API_KEY,
      fields,
      isEnv: true,
    });
  }

  if (process.env.MOONSHOT_API_KEY) {
    const gw = ALL_GATEWAYS.find((g) => g.slug === 'kimi') as Gateway;
    instances.push({
      id: 'env-kimi',
      gateway: gw,
      name: 'Kimi',
      apiKey: process.env.MOONSHOT_API_KEY,
      fields: { MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY },
      isEnv: true,
    });
  }

  const cfKey = process.env.CLOUDFLARE_API_KEY || process.env.CF_API_KEY;
  if (cfKey) {
    const gw = ALL_GATEWAYS.find((g) => g.slug === 'cloudflare') as Gateway;
    const fields: Record<string, string> = {
      CLOUDFLARE_API_KEY: cfKey,
    };
    const cfAcc = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
    if (cfAcc) fields.CLOUDFLARE_ACCOUNT_ID = cfAcc;
    const cfGw = process.env.CLOUDFLARE_GATEWAY_ID || process.env.CF_GATEWAY_ID;
    if (cfGw) fields.CLOUDFLARE_GATEWAY_ID = cfGw;
    instances.push({
      id: 'env-cloudflare',
      gateway: gw,
      name: getGatewayInstanceLabel('cloudflare', fields),
      apiKey: cfKey,
      fields,
      isEnv: true,
    });
  }

  // 2. Configured instances
  const config = loadFalconConfigV2();
  for (const gwConfig of config.gateways) {
    const gw = ALL_GATEWAYS.find((g) => g.slug === gwConfig.gatewaySlug);
    if (gw) {
      const keyVar = gw.apiKeyEnvVar || `${gw.slug.toUpperCase()}_API_KEY`;
      const apiKey = gwConfig.fields[keyVar] || '';

      instances.push({
        id: gwConfig.id,
        gateway: gw,
        name: getGatewayInstanceLabel(gwConfig.gatewaySlug, gwConfig.fields),
        apiKey,
        fields: gwConfig.fields,
      });
    }
  }

  return instances;
}

export function withGatewayEnv<T>(instance: { fields: Record<string, string> }, fn: () => T): T {
  const keysToSave = [
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'CLOUDFLARE_API_KEY',
    'CF_API_KEY',
    'CLOUDFLARE_ACCOUNT_ID',
    'CF_ACCOUNT_ID',
    'CLOUDFLARE_GATEWAY_ID',
    'CF_GATEWAY_ID',
    'OPENROUTER_API_KEY',
    'MOONSHOT_API_KEY',
    'OPENAI_COMPATIBLE_API_KEY',
    'OPENAI_COMPATIBLE_BASE_URL',
    'OPENAI_COMPATIBLE_NAME',
  ];
  const saved: Record<string, string | undefined> = {};
  for (const k of keysToSave) {
    saved[k] = process.env[k];
    delete process.env[k];
  }

  for (const [k, v] of Object.entries(instance.fields)) {
    if (v !== undefined) {
      process.env[k] = v;
    }
  }

  try {
    return fn();
  } finally {
    for (const k of keysToSave) {
      if (saved[k] !== undefined) {
        process.env[k] = saved[k];
      } else {
        delete process.env[k];
      }
    }
  }
}

export async function withGatewayEnvAsync<T>(
  instance: { fields: Record<string, string> },
  fn: () => Promise<T>,
): Promise<T> {
  const keysToSave = [
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'CLOUDFLARE_API_KEY',
    'CF_API_KEY',
    'CLOUDFLARE_ACCOUNT_ID',
    'CF_ACCOUNT_ID',
    'CLOUDFLARE_GATEWAY_ID',
    'CF_GATEWAY_ID',
    'OPENROUTER_API_KEY',
    'MOONSHOT_API_KEY',
    'OPENAI_COMPATIBLE_API_KEY',
    'OPENAI_COMPATIBLE_BASE_URL',
    'OPENAI_COMPATIBLE_NAME',
  ];
  const saved: Record<string, string | undefined> = {};
  for (const k of keysToSave) {
    saved[k] = process.env[k];
    delete process.env[k];
  }

  for (const [k, v] of Object.entries(instance.fields)) {
    if (v !== undefined) {
      process.env[k] = v;
    }
  }

  try {
    return await fn();
  } finally {
    for (const k of keysToSave) {
      if (saved[k] !== undefined) {
        process.env[k] = saved[k];
      } else {
        delete process.env[k];
      }
    }
  }
}

export function detectGateways(): { gateway: Gateway; apiKey: string }[] {
  const instances = detectGatewayInstances();
  const map = new Map<string, { gateway: Gateway; apiKey: string }>();
  for (const inst of instances) {
    if (!map.has(inst.gateway.slug)) {
      map.set(inst.gateway.slug, { gateway: inst.gateway, apiKey: inst.apiKey });
    }
  }
  return Array.from(map.values());
}
