import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ENV_FALCON_DIR, ENV_FALCON_CONFIG_FILE, DEFAULT_FALCON_DIR } from './constants.js';

const ALGORITHM = 'aes-256-cbc';

function getFalconDir(): string {
  return process.env[ENV_FALCON_DIR] || DEFAULT_FALCON_DIR;
}

function getConfigFile(): string {
  return process.env[ENV_FALCON_CONFIG_FILE] || path.join(getFalconDir(), 'config.json');
}

function getEncryptionKey(): Buffer {
  let userIdentifier = 'falcon-default-user';
  try {
    userIdentifier = os.userInfo().username;
  } catch {}

  const rawKeyMaterial = [
    os.platform(),
    os.hostname(),
    os.homedir(),
    userIdentifier,
    'falcon-secure-salt-2026',
  ].join(':');

  return crypto.createHash('sha256').update(rawKeyMaterial).digest();
}

function encrypt(text: string): { iv: string; data: string } {
  const iv = crypto.randomBytes(16);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return {
    iv: iv.toString('hex'),
    data: encrypted,
  };
}

function decrypt(encryptedData: string, ivHex: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface ConfiguredGateway {
  id: string;
  gatewaySlug: string;
  fields: Record<string, string>;
}

export interface FalconConfigV2 {
  version: 2;
  gateways: ConfiguredGateway[];
  binPaths?: Record<string, string>;
}

export function getCustomBinPath(agentSlug: string): string | undefined {
  const config = loadFalconConfigV2();
  return config.binPaths?.[agentSlug];
}

export function setCustomBinPath(agentSlug: string, binPath: string) {
  const config = loadFalconConfigV2();
  if (!config.binPaths) {
    config.binPaths = {};
  }
  config.binPaths[agentSlug] = binPath;
  saveFalconConfigV2(config);
}

export function loadFalconConfigV2(): FalconConfigV2 {
  const configFile = getConfigFile();
  try {
    if (fs.existsSync(configFile)) {
      const raw = fs.readFileSync(configFile, 'utf8').trim();
      if (!raw) return { version: 2, gateways: [] };

      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        let decryptedJson: unknown = null;
        if (
          parsed.encrypted === true &&
          typeof parsed.data === 'string' &&
          typeof parsed.iv === 'string'
        ) {
          try {
            const decryptedText = decrypt(parsed.data, parsed.iv);
            decryptedJson = JSON.parse(decryptedText);
          } catch {
            return { version: 2, gateways: [] };
          }
        } else {
          decryptedJson = parsed;
        }

        if (decryptedJson && typeof decryptedJson === 'object') {
          const obj = decryptedJson as Record<string, unknown>;
          if (obj.version === 2 && Array.isArray(obj.gateways)) {
            return decryptedJson as unknown as FalconConfigV2;
          } else {
            // V1 format! Migrate to V2
            const gateways: ConfiguredGateway[] = [];
            const flat = decryptedJson as Record<string, string>;

            if (flat.OPENROUTER_API_KEY) {
              gateways.push({
                id: 'migrated-openrouter',
                gatewaySlug: 'openrouter',
                fields: { OPENROUTER_API_KEY: flat.OPENROUTER_API_KEY },
              });
            }
            if (flat.OPENAI_API_KEY) {
              gateways.push({
                id: 'migrated-openai',
                gatewaySlug: 'openai',
                fields: {
                  OPENAI_API_KEY: flat.OPENAI_API_KEY,
                  OPENAI_BASE_URL: flat.OPENAI_BASE_URL || '',
                },
              });
            }
            if (flat.ANTHROPIC_API_KEY) {
              gateways.push({
                id: 'migrated-anthropic',
                gatewaySlug: 'anthropic',
                fields: {
                  ANTHROPIC_API_KEY: flat.ANTHROPIC_API_KEY,
                  ANTHROPIC_BASE_URL: flat.ANTHROPIC_BASE_URL || '',
                },
              });
            }
            const cfKey = flat.CLOUDFLARE_API_KEY || flat.CF_API_KEY;
            if (cfKey) {
              gateways.push({
                id: 'migrated-cloudflare',
                gatewaySlug: 'cloudflare',
                fields: {
                  CLOUDFLARE_API_KEY: cfKey,
                  CLOUDFLARE_ACCOUNT_ID: flat.CLOUDFLARE_ACCOUNT_ID || flat.CF_ACCOUNT_ID || '',
                  CLOUDFLARE_GATEWAY_ID: flat.CLOUDFLARE_GATEWAY_ID || flat.CF_GATEWAY_ID || '',
                },
              });
            }

            const migratedConfig: FalconConfigV2 = { version: 2, gateways };
            saveFalconConfigV2(migratedConfig);
            return migratedConfig;
          }
        }
      }
    }
  } catch {}
  return { version: 2, gateways: [] };
}

export function saveFalconConfigV2(config: FalconConfigV2) {
  const falconDir = getFalconDir();
  const configFile = getConfigFile();
  try {
    if (!fs.existsSync(falconDir)) {
      fs.mkdirSync(falconDir, { recursive: true });
    }
    const plainText = JSON.stringify(config);
    const encrypted = encrypt(plainText);
    const payload = {
      version: 2,
      encrypted: true,
      iv: encrypted.iv,
      data: encrypted.data,
    };
    fs.writeFileSync(configFile, JSON.stringify(payload, null, 2), 'utf8');
  } catch {}
}

export function loadFalconConfig(): Record<string, string> {
  const v2 = loadFalconConfigV2();
  const flat: Record<string, string> = {};
  for (const gw of v2.gateways) {
    for (const [k, v] of Object.entries(gw.fields)) {
      flat[k] = v;
    }
  }
  return flat;
}

export function saveFalconConfig(config: Record<string, string>) {
  const v2 = loadFalconConfigV2();
  const mappings: Record<string, string> = {
    OPENROUTER_API_KEY: 'openrouter',
    OPENAI_API_KEY: 'openai',
    OPENAI_BASE_URL: 'openai',
    ANTHROPIC_API_KEY: 'anthropic',
    ANTHROPIC_BASE_URL: 'anthropic',
    CLOUDFLARE_API_KEY: 'cloudflare',
    CF_API_KEY: 'cloudflare',
    CLOUDFLARE_ACCOUNT_ID: 'cloudflare',
    CF_ACCOUNT_ID: 'cloudflare',
    CLOUDFLARE_GATEWAY_ID: 'cloudflare',
    CF_GATEWAY_ID: 'cloudflare',
  };

  for (const [key, value] of Object.entries(config)) {
    const slug = mappings[key];
    if (slug) {
      let gw = v2.gateways.find((g) => g.gatewaySlug === slug);
      if (!gw) {
        gw = { id: `gw-${slug}`, gatewaySlug: slug, fields: {} };
        v2.gateways.push(gw);
      }
      gw.fields[key] = value;
    }
  }
  saveFalconConfigV2(v2);
}

export function injectFalconConfigToEnv() {
  const config = loadFalconConfig();
  for (const [key, value] of Object.entries(config)) {
    if (value && value.trim() !== '' && !process.env[key]) {
      process.env[key] = value;
    }
  }
}
