import type { ChildProcess } from 'child_process';

const STATSIG_MODEL_LIST_CONFIG_ID = '107580212';
const STATSIG_CACHE_PREFIX = 'statsig.cached.evaluations.';
const CODEX_APP_MODEL_LABEL_PREFIX = 'npm ';
const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 20_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: {
    result?: {
      value?: unknown;
    };
  };
  exceptionDetails?: unknown;
  error?: {
    message?: string;
  };
}

interface CdpClient {
  send(method: string, params?: Record<string, unknown>): Promise<CdpMessage>;
  close(): void;
}

interface PatchResult {
  ok: boolean;
  reason?: string;
  alreadyAllowed?: boolean;
}

interface LabelCheckResult {
  hasExpectedLabel: boolean;
  hasCustomLabel: boolean;
}

export function buildCodexAppModelDisplayName(modelName: string): string {
  return `${CODEX_APP_MODEL_LABEL_PREFIX}${modelName}`;
}

export async function patchCodexAppModelLabelAfterSpawn(
  proc: ChildProcess,
  debugPort: number,
  modelName: string,
  allCatalogModels?: string[],
): Promise<void> {
  if (!modelName || !Number.isFinite(debugPort) || debugPort <= 0) {
    return;
  }

  if (proc.exitCode !== null || proc.killed) {
    return;
  }

  // Collect all model names to patch into the allow-list.  The launched model
  // is always included; additional catalog models let the user switch freely.
  const modelNames = Array.from(new Set([modelName, ...(allCatalogModels ?? [])].filter(Boolean)));

  try {
    const client = await connectToCodexAppPage(debugPort);
    try {
      await client.send('Runtime.enable');
      await client.send('Page.enable');

      const patched = await waitForStatsigCachePatch(client, modelNames);
      if (!patched.ok) {
        return;
      }

      await client.send('Page.reload', { ignoreCache: true });
      const visible = await waitForExpectedModelLabel(client, modelName);
      if (!visible.hasExpectedLabel) {
        await waitForStatsigCachePatch(client, modelNames);
        await client.send('Page.reload', { ignoreCache: true });
        await waitForExpectedModelLabel(client, modelName);
      }
    } finally {
      client.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Warning: Failed to patch Codex Desktop model label: ${message}`);
  }
}

async function connectToCodexAppPage(debugPort: number): Promise<CdpClient> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < DEFAULT_BOOTSTRAP_TIMEOUT_MS) {
    try {
      const wsUrl = await getCodexAppPageWebSocketUrl(debugPort);
      if (wsUrl) {
        return connectCdp(wsUrl);
      }
    } catch (err) {
      lastError = err;
    }
    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  const suffix = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for Codex Desktop debugger on port ${debugPort}${suffix}`);
}

async function getCodexAppPageWebSocketUrl(debugPort: number): Promise<string | null> {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
  if (!response.ok) {
    throw new Error(`debugger /json returned HTTP ${response.status}`);
  }

  const targets = (await response.json()) as Array<{
    type?: string;
    webSocketDebuggerUrl?: string;
  }>;
  return targets.find((target) => target.type === 'page')?.webSocketDebuggerUrl ?? null;
}

function connectCdp(wsUrl: string): Promise<CdpClient> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let nextId = 0;
    const pending = new Map<number, (message: CdpMessage) => void>();

    socket.addEventListener('open', () => {
      resolve({
        send(method: string, params: Record<string, unknown> = {}) {
          return new Promise<CdpMessage>((sendResolve, sendReject) => {
            if (socket.readyState !== WebSocket.OPEN) {
              sendReject(new Error('CDP socket is not open'));
              return;
            }

            const id = ++nextId;
            pending.set(id, sendResolve);
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        },
      });
    });

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id == null) {
        return;
      }
      const resolveMessage = pending.get(message.id);
      if (resolveMessage) {
        pending.delete(message.id);
        resolveMessage(message);
      }
    });

    socket.addEventListener('error', () => {
      reject(new Error(`Failed to connect to CDP socket ${wsUrl}`));
    });
  });
}

async function waitForStatsigCachePatch(
  client: CdpClient,
  modelNames: string[],
): Promise<PatchResult> {
  const startedAt = Date.now();
  let result: PatchResult = { ok: false, reason: 'not_started' };

  while (Date.now() - startedAt < DEFAULT_BOOTSTRAP_TIMEOUT_MS) {
    result = await patchStatsigCache(client, modelNames);
    if (result.ok) {
      return result;
    }
    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  return result;
}

async function patchStatsigCache(client: CdpClient, modelNames: string[]): Promise<PatchResult> {
  const response = await client.send('Runtime.evaluate', {
    expression: `(${patchStatsigCacheInRenderer.toString()})(${JSON.stringify({
      cachePrefix: STATSIG_CACHE_PREFIX,
      configId: STATSIG_MODEL_LIST_CONFIG_ID,
      modelNames,
    })})`,
    returnByValue: true,
  });

  if (response.exceptionDetails || response.error) {
    return { ok: false, reason: 'evaluation_failed' };
  }

  return (
    (response.result?.result?.value as PatchResult | undefined) ?? {
      ok: false,
      reason: 'missing_result',
    }
  );
}

function patchStatsigCacheInRenderer({
  cachePrefix,
  configId,
  modelNames,
}: {
  cachePrefix: string;
  configId: string;
  modelNames: string[];
}): PatchResult {
  const key = Object.keys(localStorage).find((candidate) => candidate.startsWith(cachePrefix));
  if (!key) {
    return { ok: false, reason: 'missing_statsig_cache_key' };
  }

  try {
    const outer = JSON.parse(localStorage.getItem(key) ?? 'null');
    const data = JSON.parse(outer?.data ?? 'null');
    const config = data?.dynamic_configs?.[configId];
    if (!config?.value) {
      return { ok: false, reason: 'missing_model_list_config' };
    }

    const availableModels = Array.isArray(config.value.available_models)
      ? config.value.available_models
      : [];
    const alreadyAllowed = modelNames.every((m) => availableModels.includes(m));
    config.value.available_models = Array.from(new Set([...availableModels, ...modelNames]));
    config.value.use_hidden_models = true;
    outer.data = JSON.stringify(data);
    outer.source = 'FalconLocalOverride';
    outer.receivedAt = Date.now();
    localStorage.setItem(key, JSON.stringify(outer));
    return { ok: true, alreadyAllowed };
  } catch {
    return { ok: false, reason: 'invalid_statsig_cache' };
  }
}

async function waitForExpectedModelLabel(
  client: CdpClient,
  modelName: string,
): Promise<LabelCheckResult> {
  const startedAt = Date.now();
  let result: LabelCheckResult = { hasExpectedLabel: false, hasCustomLabel: false };

  while (Date.now() - startedAt < DEFAULT_BOOTSTRAP_TIMEOUT_MS / 2) {
    result = await checkModelLabel(client, modelName);
    if (result.hasExpectedLabel) {
      return result;
    }
    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  return result;
}

async function checkModelLabel(client: CdpClient, modelName: string): Promise<LabelCheckResult> {
  const response = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const text = document.body?.innerText || '';
      return {
        hasExpectedLabel: text.includes(${JSON.stringify(buildCodexAppModelDisplayName(modelName))}),
        hasCustomLabel: text.includes('Custom'),
      };
    })()`,
    returnByValue: true,
  });

  return (
    (response.result?.result?.value as LabelCheckResult | undefined) ?? {
      hasExpectedLabel: false,
      hasCustomLabel: false,
    }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
