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
