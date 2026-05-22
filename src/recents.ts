/**
 * Persists recently used models to ~/.falcon/recents.json so they can be
 * surfaced at the top of the model picker across CLI sessions.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ModelInfo } from './gateways/index.js';

const FALCON_DIR = path.join(os.homedir(), '.falcon');
const RECENTS_FILE = path.join(FALCON_DIR, 'recents.json');
const MAX_RECENTS = 5;

interface RecentEntry {
  id: string;
  name: string;
  contextLength?: number;
  pricing?: { prompt: string; completion: string; promptPerM?: number };
  provider?: string;
  /** ISO timestamp of last selection */
  lastUsed: string;
}

function readRecents(): RecentEntry[] {
  try {
    const raw = fs.readFileSync(RECENTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

function writeRecents(entries: RecentEntry[]): void {
  try {
    if (!fs.existsSync(FALCON_DIR)) {
      fs.mkdirSync(FALCON_DIR, { recursive: true });
    }
    fs.writeFileSync(RECENTS_FILE, JSON.stringify(entries, null, 2), 'utf8');
  } catch {
    // Non-fatal: recents are best-effort
  }
}

/** Record a model selection. Moves it to the front if already present. */
export function recordRecentModel(model: ModelInfo): void {
  const entries = readRecents().filter((e) => e.id !== model.id);
  entries.unshift({
    id: model.id,
    name: model.name,
    contextLength: model.contextLength,
    pricing: model.pricing,
    provider: model.provider,
    lastUsed: new Date().toISOString(),
  });
  writeRecents(entries.slice(0, MAX_RECENTS));
}

/** Returns up to MAX_RECENTS recently used models, most-recent first. */
export function getRecentModels(): ModelInfo[] {
  return readRecents().map((e) => ({
    id: e.id,
    name: e.name,
    contextLength: e.contextLength,
    pricing: e.pricing,
    provider: e.provider,
  }));
}
