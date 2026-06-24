import * as fs from 'fs';
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
  const metadata = findModelMetadata(catalogMetadata, modelName);
  const contextWindow = metadata?.contextLength || fallbackContextWindow(modelName);
  const modalities = cleanModalities(metadata?.modalities ?? fallbackModalities(modelName));
  const truncationMode = modelName.includes('/') ? 'tokens' : 'bytes';

  const entry = {
    slug: modelName,
    display_name: modelName,
    context_window: contextWindow,
    shell_type: 'default',
    visibility: 'list',
    supported_in_api: true,
    priority: 0,
    truncation_policy: { mode: truncationMode, limit: 10000 },
    input_modalities: modalities,
    base_instructions: '',
    support_verbosity: true,
    default_verbosity: 'low',
    supports_parallel_tool_calls: false,
    supports_reasoning_summaries: false,
    supported_reasoning_levels: [],
    experimental_supported_tools: [],
  };

  const existingIndex = catalog.models.findIndex((m) => m.slug === modelName);
  if (existingIndex !== -1) {
    catalog.models[existingIndex] = entry;
  } else {
    catalog.models.push(entry);
  }

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
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
