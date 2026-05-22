import net from 'net';

/**
 * Gets a free TCP port by binding to 127.0.0.1.
 * Ensures we listen on localhost to prevent external access.
 */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'string' ? 0 : address?.port || 0;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

/**
 * Waits for a TCP port to become active on 127.0.0.1.
 */
export function waitForPort(port: number, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const socket = new net.Socket();
      socket.setTimeout(200);
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, 100);
        }
      });
      socket.on('timeout', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, 100);
        }
      });
      socket.connect(port, '127.0.0.1');
    }
    check();
  });
}

/**
 * Formats a context length number into a human-readable string (e.g., 200k, 1M).
 */
export function formatCtx(len: number): string {
  if (len >= 1000000) return `${(len / 1000000).toFixed(0)}M ctx`;
  if (len >= 1000) return `${(len / 1000).toFixed(0)}k ctx`;
  return `${len} ctx`;
}

/**
 * Safely masks sensitive keys or values before logging/printing.
 */
export function maskString(val: string): string {
  if (!val) return '';
  return val.length > 16 ? val.substring(0, 8) + '...' + val.substring(val.length - 4) : val;
}

// Minimal shape needed for sorting — avoids importing from gateways (would be circular).
interface SortableModel {
  created?: number;
  pricing?: { promptPerM?: number };
  contextLength?: number;
}

/**
 * Formats a per-1M-token price into a display string.
 * e.g. 2.0 → "$2.00/1M", 0.15 → "$0.15/1M", 0 → "free"
 */
export function formatPricePerM(perM: number): string {
  if (perM === 0) return 'free';
  if (perM < 0.01) return `$${perM.toFixed(4)}/1M`;
  return `$${perM.toFixed(2)}/1M`;
}

/**
 * Sorts models: newest first (by `created` Unix timestamp), then cheapest
 * prompt price, then largest context window as a final tiebreaker.
 */
export function sortModels(a: SortableModel, b: SortableModel): number {
  // 1. Newest first (higher timestamp = newer)
  const createdDiff = (b.created ?? 0) - (a.created ?? 0);
  if (createdDiff !== 0) return createdDiff;

  // 2. Cheaper prompt price first (0 = free, treated as cheapest)
  const aPrice = a.pricing?.promptPerM ?? 0;
  const bPrice = b.pricing?.promptPerM ?? 0;
  const priceDiff = aPrice - bPrice;
  if (priceDiff !== 0) return priceDiff;

  // 3. Larger context window first
  const ctxDiff = (b.contextLength ?? 0) - (a.contextLength ?? 0);
  if (ctxDiff !== 0) return ctxDiff;

  return 0;
}
