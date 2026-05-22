import { formatPricePerM } from '../../utils.js';
import type { ModelInfo } from '../index.js';

export interface ModelMetadata {
  contextLength: number;
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

export function setLocalModelMetadataCache(cache: Record<string, ModelMetadata> | null): void {
  metadataCache = cache;
}

export function clearModelMetadataCache(): void {
  metadataCache = null;
}

export async function fetchModelMetadataCatalog(): Promise<Record<string, ModelMetadata>> {
  if (metadataCache) {
    return metadataCache;
  }

  // Skip remote fetch in test environment unless pre-cached
  if (process.env.NODE_ENV === 'test') {
    return {};
  }

  const cache: Record<string, ModelMetadata> = {};
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) return cache;
    const data = (await res.json()) as {
      data: Array<{
        id: string;
        context_length?: number;
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

      const metadata: ModelMetadata = {
        contextLength,
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
  } catch {
    // Ignore fetch errors, return empty cache
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
