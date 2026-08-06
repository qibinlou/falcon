import * as fs from 'fs';
import type { ModelInfo } from '../gateways/index.js';
import {
  fetchModelMetadataCatalog,
  normalizeModelId,
  type ModelMetadata,
} from '../gateways/shared/modelEnricher.js';

function fallbackContextWindow(modelName: string): number {
  const name = modelName.toLowerCase();
  if (name.includes('claude-3')) {
    return 200000;
  }
  if (name.includes('gpt-4o') || name.includes('gpt-4-turbo') || name.includes('gpt-4')) {
    return 128000;
  }
  if (name.includes('gpt-3.5')) {
    return 16385;
  }
  if (name.includes('gemini-1.5') || name.includes('gemini-2.0') || name.includes('gemini-2.5')) {
    return 1000000;
  }
  return 128000; // fallback default
}

function fallbackModalities(modelName: string): string[] {
  const name = modelName.toLowerCase();
  const hasVision =
    name.includes('vision') ||
    name.includes('gpt-4o') ||
    name.includes('claude-3') ||
    name.includes('gemini');
  const modalities = ['text'];
  if (hasVision) {
    modalities.push('image');
  }
  return modalities;
}

function cleanModalities(rawModalities: string[]): string[] {
  const filtered = rawModalities.filter((m) => m === 'text' || m === 'image');
  return filtered.length > 0 ? filtered : ['text'];
}

function findModelMetadata(
  catalog: Record<string, ModelMetadata>,
  modelName: string,
): ModelMetadata | undefined {
  const id = modelName.toLowerCase();
  const normalized = normalizeModelId(modelName);
  return catalog[id] || catalog[normalized];
}

const DEFAULT_REASONING_LEVELS = [
  { effort: 'low', description: 'Fast responses with lighter reasoning' },
  { effort: 'medium', description: 'Balances speed and reasoning depth for everyday tasks' },
  { effort: 'high', description: 'Greater reasoning depth for complex problems' },
  { effort: 'xhigh', description: 'Extra high reasoning depth for complex problems' },
];

function normalizeCodexCatalogEntry(entry: {
  slug: string;
  [key: string]: unknown;
}): { slug: string; [key: string]: unknown } {
  const contextWindow =
    typeof entry.context_window === 'number' && entry.context_window > 0
      ? entry.context_window
      : fallbackContextWindow(entry.slug);
  const inputModalities = Array.isArray(entry.input_modalities)
    ? cleanModalities(entry.input_modalities.filter((value): value is string => typeof value === 'string'))
    : fallbackModalities(entry.slug);

  return {
    ...entry,
    display_name:
      typeof entry.display_name === 'string' && entry.display_name.length > 0
        ? entry.display_name
        : entry.slug,
    description:
      typeof entry.description === 'string' && entry.description.length > 0
        ? entry.description
        : 'Routed through Falcon.',
    context_window: contextWindow,
    max_context_window:
      typeof entry.max_context_window === 'number' && entry.max_context_window > 0
        ? Math.min(entry.max_context_window, contextWindow)
        : contextWindow,
    effective_context_window_percent:
      typeof entry.effective_context_window_percent === 'number'
        ? entry.effective_context_window_percent
        : 95,
    auto_compact_token_limit:
      typeof entry.auto_compact_token_limit === 'number'
        ? entry.auto_compact_token_limit
        : Math.floor(contextWindow * 0.9),
    comp_hash: typeof entry.comp_hash === 'string' ? entry.comp_hash : 'falcon',
    shell_type: 'shell_command',
    visibility: 'list',
    supported_in_api: true,
    priority: typeof entry.priority === 'number' ? entry.priority : 0,
    truncation_policy:
      entry.truncation_policy && typeof entry.truncation_policy === 'object'
        ? entry.truncation_policy
        : { mode: 'tokens', limit: 10000 },
    input_modalities: inputModalities,
    base_instructions: typeof entry.base_instructions === 'string' ? entry.base_instructions : '',
    support_verbosity:
      typeof entry.support_verbosity === 'boolean' ? entry.support_verbosity : true,
    default_verbosity:
      typeof entry.default_verbosity === 'string' ? entry.default_verbosity : 'low',
    apply_patch_tool_type:
      typeof entry.apply_patch_tool_type === 'string' ? entry.apply_patch_tool_type : 'freeform',
    supports_parallel_tool_calls:
      typeof entry.supports_parallel_tool_calls === 'boolean'
        ? entry.supports_parallel_tool_calls
        : false,
    supports_reasoning_summaries:
      typeof entry.supports_reasoning_summaries === 'boolean'
        ? entry.supports_reasoning_summaries
        : false,
    default_reasoning_summary:
      typeof entry.default_reasoning_summary === 'string'
        ? entry.default_reasoning_summary
        : 'none',
    default_reasoning_level:
      typeof entry.default_reasoning_level === 'string' ? entry.default_reasoning_level : 'medium',
    supported_reasoning_levels:
      Array.isArray(entry.supported_reasoning_levels) && entry.supported_reasoning_levels.length > 0
        ? entry.supported_reasoning_levels
        : DEFAULT_REASONING_LEVELS,
    supports_image_detail_original:
      typeof entry.supports_image_detail_original === 'boolean'
        ? entry.supports_image_detail_original
        : inputModalities.includes('image'),
    supports_search_tool:
      typeof entry.supports_search_tool === 'boolean' ? entry.supports_search_tool : false,
    experimental_supported_tools: Array.isArray(entry.experimental_supported_tools)
      ? entry.experimental_supported_tools
      : [],
  };
}

export async function getContextWindow(modelName: string): Promise<number> {
  const catalog = await fetchModelMetadataCatalog();
  const metadata = findModelMetadata(catalog, modelName);
  return metadata?.contextLength || fallbackContextWindow(modelName);
}

export async function getModalities(modelName: string): Promise<string[]> {
  const catalog = await fetchModelMetadataCatalog();
  const metadata = findModelMetadata(catalog, modelName);
  return cleanModalities(metadata?.modalities ?? fallbackModalities(modelName));
}

export async function writeCodexModelCatalog(
  catalogPath: string,
  modelName: string,
  options: {
    displayName?: string;
    models?: ModelInfo[];
    displayNameForModel?: (model: ModelInfo) => string;
  } = {},
): Promise<void> {
  let catalog: { models: { slug: string; [key: string]: unknown }[] } = { models: [] };
  if (fs.existsSync(catalogPath)) {
    try {
      const data = fs.readFileSync(catalogPath, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.models)) {
        catalog = parsed;
      }
    } catch (_e) {
      // Ignore reading error and overwrite/create new
    }
  }

  const catalogMetadata = await fetchModelMetadataCatalog();
  const buildEntry = (candidate: ModelInfo, priority: number) => {
    const metadata = findModelMetadata(catalogMetadata, candidate.id);
    const contextWindow =
      candidate.contextLength || metadata?.contextLength || fallbackContextWindow(candidate.id);
    const modalities = cleanModalities(
      metadata?.modalities ?? fallbackModalities(candidate.id),
    );
    return normalizeCodexCatalogEntry({
      slug: candidate.id,
      display_name:
        candidate.id === modelName && options.displayName
          ? options.displayName
          : options.displayNameForModel?.(candidate) ?? candidate.id,
      description: `Routed through Falcon as ${candidate.id}.`,
      context_window: contextWindow,
      input_modalities: modalities,
      priority,
    });
  };

  if (options.models) {
    const selected = options.models.find((candidate) => candidate.id === modelName) ?? {
      id: modelName,
      name: modelName,
    };
    const ordered = [selected, ...options.models.filter((candidate) => candidate.id !== modelName)];
    const seen = new Set<string>();
    catalog.models = ordered
      .filter((candidate) => {
        if (!candidate.id || seen.has(candidate.id)) return false;
        seen.add(candidate.id);
        return true;
      })
      .map(buildEntry);
  } else {
    catalog.models = catalog.models.map(normalizeCodexCatalogEntry);
    const selected = buildEntry({ id: modelName, name: modelName }, 0);
    const remaining = catalog.models.filter((candidate) => candidate.slug !== modelName);
    catalog.models = [selected, ...remaining].map((candidate, priority) => ({
      ...candidate,
      priority,
    }));
  }

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
}

/** Writes the native cache shape Codex App reads before refreshing model.json. */
export function writeCodexModelsCache(catalogPath: string, cachePath: string): void {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as {
    models?: unknown[];
  };
  const cache = {
    fetched_at: '2000-01-01T00:00:00Z',
    client_version: '0.0.0',
    models: Array.isArray(catalog.models) ? catalog.models : [],
  };
  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

/** Derives the `[model_providers.<key>]` name from a base URL's hostname. */
export function deriveProviderKey(resolvedBaseUrl?: string): string {
  if (!resolvedBaseUrl) {
    return 'falcon';
  }
  try {
    const urlStr = resolvedBaseUrl.includes('://') ? resolvedBaseUrl : `http://${resolvedBaseUrl}`;
    const sanitizedUrlStr = urlStr.replace('<BIFROST_PORT>', '9999');
    const parsedUrl = new URL(sanitizedUrlStr);
    if (parsedUrl.hostname) {
      return parsedUrl.hostname.replaceAll('.', '-');
    }
  } catch (_e) {
    // Fall back to the default
  }
  return 'falcon';
}

/** Inserts or replaces a `[header]` section (until the next section) in TOML text. */
export function upsertSection(text: string, header: string, lines: string[]): string {
  const fileLines = text.split(/\r?\n/);
  const targetHeader = header.trim();
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < fileLines.length; i++) {
    const trimmed = fileLines[i].trim();
    if (trimmed === targetHeader) {
      startIndex = i;
      for (let j = i + 1; j < fileLines.length; j++) {
        const nextTrimmed = fileLines[j].trim();
        if (nextTrimmed.startsWith('[') && nextTrimmed.endsWith(']')) {
          endIndex = j;
          break;
        }
      }
      if (endIndex === -1) {
        endIndex = fileLines.length;
      }
      break;
    }
  }

  const blockLines = [targetHeader, ...lines, ''];
  if (startIndex !== -1) {
    fileLines.splice(startIndex, endIndex - startIndex, ...blockLines);
  } else {
    if (fileLines.length > 0 && fileLines[fileLines.length - 1].trim() !== '') {
      fileLines.push('');
    }
    fileLines.push(...blockLines);
  }
  return fileLines.join('\n');
}

/** Removes a `[header]` section (until the next section) in TOML text. */
export function removeSection(text: string, header: string): string {
  const fileLines = text.split(/\r?\n/);
  const targetHeader = header.trim();
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < fileLines.length; i++) {
    const trimmed = fileLines[i].trim();
    if (trimmed === targetHeader) {
      startIndex = i;
      for (let j = i + 1; j < fileLines.length; j++) {
        const nextTrimmed = fileLines[j].trim();
        if (nextTrimmed.startsWith('[') && nextTrimmed.endsWith(']')) {
          endIndex = j;
          break;
        }
      }
      if (endIndex === -1) {
        endIndex = fileLines.length;
      }
      break;
    }
  }

  if (startIndex !== -1) {
    fileLines.splice(startIndex, endIndex - startIndex);
  }
  return fileLines.join('\n');
}

/** Inserts or replaces a top-level `key = "value"` (before the first section). */
export function upsertTopLevelKey(text: string, key: string, value: string): string {
  const lines = text.split(/\r?\n/);
  let firstSection = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('[') && t.endsWith(']')) {
      firstSection = i;
      break;
    }
  }

  const assignment = `${key} = "${value}"`;
  const keyRe = new RegExp(`^\\s*${key}\\s*=`);
  for (let i = 0; i < firstSection; i++) {
    if (keyRe.test(lines[i])) {
      lines[i] = assignment;
      return lines.join('\n');
    }
  }
  lines.splice(firstSection, 0, assignment);
  return lines.join('\n');
}
