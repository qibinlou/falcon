import fs from 'fs';
import path from 'path';
import { DEFAULT_FALCON_DIR, ENV_FALCON_DIR } from '../../constants.js';
import { formatPricePerM } from '../../utils.js';
import type { ModelInfo } from '../index.js';

export interface ModelMetadata {
  contextLength: number;
  modalities?: string[];
  pricing: {
    prompt: string;
    completion: string;
    promptPerM: number;
  };
}

export function normalizeModelId(id: string): string {
  let normalized = id.toLowerCase();

  // 1. Remove provider prefix (e.g. "openai/gpt-4o" -> "gpt-4o")
  const parts = normalized.split('/');
  normalized = parts[parts.length - 1] || normalized;

  // 2. Remove tag/version suffix after colon (e.g. "gpt-4o:free" -> "gpt-4o")
  normalized = normalized.split(':')[0] || normalized;

  // 3. Remove -latest suffix (e.g., -latest)
  normalized = normalized.replace(/-latest$/, '');

  // 4. Remove date suffixes:
  // - YYYYMMDD (e.g., -20241022)
  // - YYYY-MM-DD (e.g., -2024-05-13)
  // - MMDD (e.g., -0613)
  normalized = normalized.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  normalized = normalized.replace(/-\d{8}$/, '');
  normalized = normalized.replace(/-\d{4}$/, '');

  // 5. Remove -latest suffix again (in case of weird order like -latest-20241022)
  normalized = normalized.replace(/-latest$/, '');

  // 6. Replace dots and underscores with hyphens
  normalized = normalized.replace(/[._]/g, '-');

  // 7. Collapse multiple hyphens
  normalized = normalized.replace(/-+/g, '-');

  return normalized.trim();
}

let metadataCache: Record<string, ModelMetadata> | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_VERSION = 1;

interface CachedMetadataCatalog {
  version: number;
  fetchedAt: number;
  models: Record<string, ModelMetadata>;
}

export function setLocalModelMetadataCache(cache: Record<string, ModelMetadata> | null): void {
  metadataCache = cache;
}

export function clearModelMetadataCache(): void {
  metadataCache = null;
}

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test' || process.argv.some((arg) => arg.includes('--test'));
}

function getMetadataCachePath(): string {
  return (
    process.env.FALCON_MODEL_METADATA_CACHE_PATH ||
    path.join(process.env[ENV_FALCON_DIR] || DEFAULT_FALCON_DIR, 'cache', 'openrouter-models.json')
  );
}

function readCachedMetadataCatalog(allowStale = false): Record<string, ModelMetadata> | null {
  try {
    const raw = fs.readFileSync(getMetadataCachePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<CachedMetadataCatalog>;
    if (
      parsed.version !== CACHE_VERSION ||
      typeof parsed.fetchedAt !== 'number' ||
      !parsed.models ||
      typeof parsed.models !== 'object'
    ) {
      return null;
    }

    const isFresh = Date.now() - parsed.fetchedAt < CACHE_TTL_MS;
    if (!isFresh && !allowStale) {
      return null;
    }

    return parsed.models as Record<string, ModelMetadata>;
  } catch {
    return null;
  }
}

function writeCachedMetadataCatalog(models: Record<string, ModelMetadata>): void {
  try {
    const cachePath = getMetadataCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const payload: CachedMetadataCatalog = {
      version: CACHE_VERSION,
      fetchedAt: Date.now(),
      models,
    };
    fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Best-effort cache only; catalog lookups still work from memory.
  }
}

function normalizeModalities(modalities: unknown): string[] | undefined {
  if (!Array.isArray(modalities)) {
    return undefined;
  }

  const normalized = Array.from(
    new Set(
      modalities
        .filter((modality): modality is string => typeof modality === 'string')
        .map((modality) => modality.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  return normalized.length > 0 ? normalized : undefined;
}

export async function fetchModelMetadataCatalog(): Promise<Record<string, ModelMetadata>> {
  if (metadataCache) {
    return metadataCache;
  }

  const shouldUseDiskCache = !isTestEnvironment() || !!process.env.FALCON_MODEL_METADATA_CACHE_PATH;
  if (shouldUseDiskCache) {
    const cached = readCachedMetadataCatalog();
    if (cached) {
      metadataCache = cached;
      return cached;
    }
  }

  // Skip remote fetch in test environment unless pre-cached.
  if (isTestEnvironment() && process.env.FALCON_ALLOW_MODEL_METADATA_FETCH_IN_TESTS !== '1') {
    return {};
  }

  const cache: Record<string, ModelMetadata> = {};
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) {
      const staleCache = shouldUseDiskCache ? readCachedMetadataCatalog(true) : null;
      if (staleCache) {
        metadataCache = staleCache;
        return staleCache;
      }
      return cache;
    }
    const data = (await res.json()) as {
      data: Array<{
        id: string;
        context_length?: number;
        architecture?: { input_modalities?: string[] };
        pricing?: { prompt: string; completion: string };
      }>;
    };

    for (const m of data.data) {
      if (!m.id) continue;
      // Strip provider prefix, e.g. "openai/gpt-4o" -> "gpt-4o"
      const parts = m.id.split('/');
      const strippedId = parts[1] || parts[0] || m.id;

      const contextLength = m.context_length ?? 0;
      const promptRaw = parseFloat(m.pricing?.prompt ?? '0');
      const completionRaw = parseFloat(m.pricing?.completion ?? '0');
      const promptPerM = promptRaw * 1_000_000;
      const completionPerM = completionRaw * 1_000_000;
      const modalities = normalizeModalities(m.architecture?.input_modalities);

      const metadata: ModelMetadata = {
        contextLength,
        ...(modalities ? { modalities } : {}),
        pricing: {
          prompt: formatPricePerM(promptPerM),
          completion: formatPricePerM(completionPerM),
          promptPerM,
        },
      };

      const fullId = m.id.toLowerCase();
      cache[fullId] = metadata;

      const key1 = strippedId.toLowerCase();
      cache[key1] = metadata;

      const normId = normalizeModelId(m.id);
      cache[normId] = metadata;

      const key2 = key1.replace(/\./g, '-');
      if (key2 !== key1) {
        cache[key2] = metadata;
      }
    }
    metadataCache = cache;
    writeCachedMetadataCatalog(cache);
  } catch {
    const staleCache = shouldUseDiskCache ? readCachedMetadataCatalog(true) : null;
    if (staleCache) {
      metadataCache = staleCache;
      return staleCache;
    }
  }
  return cache;
}

export function enrichModelWithCatalog(
  model: ModelInfo,
  catalog: Record<string, ModelMetadata>,
): ModelInfo {
  // If already fully enriched, return as-is
  if (model.contextLength && model.pricing) {
    return model;
  }

  const id = model.id.toLowerCase();
  const idNormalized = normalizeModelId(id);

  const match = catalog[id] || catalog[idNormalized];
  if (match) {
    const updated = { ...model };
    if (!updated.contextLength) {
      updated.contextLength = match.contextLength;
    }
    if (!updated.pricing) {
      updated.pricing = match.pricing;
    }
    return updated;
  }

  return model;
}

export function enrichModelInfo(model: ModelInfo): ModelInfo {
  return enrichModelWithCatalog(model, metadataCache || {});
}
