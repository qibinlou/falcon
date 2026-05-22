/**
 * e2e/helpers.ts
 * Shared utilities for Falcon CLI end-to-end tests.
 */

import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const CLI_ENTRY = path.join(ROOT, 'src', 'cli.ts');
export const ENV_FILE = path.join(ROOT, '.env');

// ─── .env loader ─────────────────────────────────────────────────────────────

/**
 * Reads `.env` from the project root and merges keys into process.env.
 * Call once at the top of each test file.
 */
export function loadDotEnv(): void {
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    // Only set if not already present (real env takes priority)
    if (key && val && val !== 'placeholder' && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

// ─── Spawn helper ────────────────────────────────────────────────────────────

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SpawnOptions {
  /** Override environment variables. Defaults to the current process.env. */
  env?: Record<string, string | undefined>;
  /** Working directory. Defaults to project root. */
  cwd?: string;
  /** Timeout in ms. Defaults to 15000 (15 s). */
  timeout?: number;
}

/**
 * Spawns `tsx src/cli.ts <args>` synchronously and returns stdout/stderr/exit code.
 *
 * When `opts.env` is provided it is used as the complete environment for the
 * child process (after adding NO_COLOR). This is intentional — callers that
 * use `buildEnv()` have already constructed a clean, isolated env that must
 * not be polluted by gateway keys inherited from the parent shell.
 */
export function spawnCli(args: string[], opts: SpawnOptions = {}): SpawnResult {
  let env: Record<string, string | undefined>;

  const testConfigDir = path.join(os.tmpdir(), `falcon-e2e-isolated-${process.pid}`);
  const envExtra = {
    FALCON_DIR: opts.env?.FALCON_DIR || testConfigDir,
    FALCON_CONFIG_FILE: opts.env?.FALCON_CONFIG_FILE || path.join(testConfigDir, 'config.json'),
  };

  if (opts.env) {
    // Caller supplied a fully-constructed env (e.g. via buildEnv).
    // Use it as-is, only adding the no-colour flags.
    env = {
      ...opts.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      ...envExtra,
    };
  } else {
    // No override — inherit the full parent env.
    env = {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      ...envExtra,
    };
  }

  const result: SpawnSyncReturns<Buffer> = spawnSync('npx', ['tsx', CLI_ENTRY, ...args], {
    cwd: opts.cwd ?? ROOT,
    env: env as NodeJS.ProcessEnv,
    timeout: opts.timeout ?? 15_000,
    encoding: 'buffer',
  });

  const stdout = (result.stdout ?? Buffer.alloc(0)).toString('utf8');
  const stderr = (result.stderr ?? Buffer.alloc(0)).toString('utf8');
  const exitCode = result.status ?? (result.error ? 1 : 0);

  return { stdout, stderr, exitCode };
}

// ─── Environment builders ────────────────────────────────────────────────────

/** The API key names Falcon supports. */
export type ApiKeyName =
  | 'OPENROUTER_API_KEY'
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'CLOUDFLARE_API_KEY';

/**
 * Returns an env object that strips all known gateway keys except those provided.
 * Keys are omitted entirely (not set to undefined/"") so spawnSync does not
 * inherit them from the parent shell environment.
 */
export function buildEnv(
  include: Partial<Record<ApiKeyName, string>> = {},
): Record<string, string> {
  const STRIP_VARS = [
    'OPENROUTER_API_KEY',
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
  ];

  // Build a clean env from the current process, omitting all gateway keys and config overrides
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !STRIP_VARS.includes(k)) {
      base[k] = v;
    }
  }

  // Inject only the explicitly requested keys
  for (const [k, v] of Object.entries(include)) {
    if (v !== undefined) {
      base[k] = v;
    }
  }

  return base;
}

/**
 * Reads the value of a gateway key from the current process environment (after
 * loadDotEnv() has been called). Returns undefined if the key is not set or is
 * a placeholder.
 */
export function getKey(name: ApiKeyName): string | undefined {
  const val = process.env[name];
  if (!val || val === 'placeholder') return undefined;
  return val;
}

// ─── Skip helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a message to pass to `skip()` if the given env key is missing,
 * or `undefined` if the key is present.
 *
 * Usage inside a test:
 *   const skip = missingKey('OPENROUTER_API_KEY');
 *   if (skip) { ctx.skip(skip); return; }
 */
export function missingKey(name: ApiKeyName): string | undefined {
  return getKey(name) ? undefined : `${name} not set — skipping`;
}

// ─── Assertion helpers ───────────────────────────────────────────────────────

/**
 * Asserts that `haystack` contains `needle`, throwing with a descriptive
 * message if not.
 */
export function assertContains(haystack: string, needle: string, label = ''): void {
  if (!haystack.includes(needle)) {
    const prefix = label ? `[${label}] ` : '';
    throw new Error(
      `${prefix}Expected output to contain "${needle}".\n` + `Actual output:\n${haystack}`,
    );
  }
}

/**
 * Asserts that `haystack` does NOT contain `needle`.
 */
export function assertNotContains(haystack: string, needle: string, label = ''): void {
  if (haystack.includes(needle)) {
    const prefix = label ? `[${label}] ` : '';
    throw new Error(
      `${prefix}Expected output NOT to contain "${needle}".\n` + `Actual output:\n${haystack}`,
    );
  }
}

/**
 * Asserts exit code matches expected value.
 */
export function assertExitCode(result: SpawnResult, expected: number): void {
  if (result.exitCode !== expected) {
    throw new Error(
      `Expected exit code ${expected}, got ${result.exitCode}.\n` +
        `stdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
}

// ─── Temp dir ────────────────────────────────────────────────────────────────

/**
 * Creates a temporary directory scoped to this test run.
 * Caller is responsible for cleanup via `fs.rmSync(dir, { recursive: true })`.
 */
export function makeTempDir(prefix = 'falcon-e2e-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
