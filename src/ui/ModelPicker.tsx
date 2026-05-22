import { Box, Text, useInput } from 'ink';
import { useMemo, useState } from 'react';
import type { ModelInfo } from '../gateways/index.js';

interface ModelPickerProps {
  models: ModelInfo[];
  recentModels?: ModelInfo[];
  onSelect: (model: ModelInfo) => void;
  onCancel: () => void;
  onConfigure?: () => void;
  showGatewayBadge?: boolean;
}

const PAGE_SIZE = 12;

// ---------------------------------------------------------------------------
// Fuzzy-match helpers
// ---------------------------------------------------------------------------

/**
 * Computes the Levenshtein distance between two strings.
 * Used to power fuzzy search ("gemoni" matches "gemini").
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Use a flat 1-D array to avoid allocating a 2-D matrix every call
  const dp: number[] = Array.from({ length: (m + 1) * (n + 1) }, () => 0);
  const idx = (i: number, j: number) => i * (n + 1) + j;

  for (let i = 0; i <= m; i++) dp[idx(i, 0)] = i;
  for (let j = 0; j <= n; j++) dp[idx(0, j)] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[idx(i, j)] = dp[idx(i - 1, j - 1)];
      } else {
        dp[idx(i, j)] =
          1 +
          Math.min(
            dp[idx(i - 1, j)], // deletion
            dp[idx(i, j - 1)], // insertion
            dp[idx(i - 1, j - 1)], // substitution
          );
      }
    }
  }
  return dp[idx(m, n)] ?? 0;
}

/**
 * Returns true if `query` fuzzy-matches `target`.
 *
 * Strategy (in order of preference):
 *  1. Substring match (exact, case-insensitive) — zero cost, always wins.
 *  2. Sliding-window Levenshtein: slide a window of `query.length` chars
 *     across `target` and check if any window has distance ≤ threshold.
 *  3. Whole-string Levenshtein as a final fallback.
 *
 * Threshold scales with query length so very short queries stay precise.
 */
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (!q) return true;
  if (t.includes(q)) return true;

  // Allow 1 typo per 4 characters of query, max 3
  const threshold = Math.min(3, Math.floor(q.length / 4));
  if (threshold === 0) return false;

  // Sliding window across target
  const winLen = q.length;
  for (let start = 0; start <= t.length - winLen; start++) {
    const window = t.slice(start, start + winLen);
    if (levenshtein(q, window) <= threshold) return true;
  }

  // Full-string distance (catches short targets)
  return levenshtein(q, t) <= threshold;
}

function modelMatchesQuery(model: ModelInfo, query: string): boolean {
  if (!query) return true;
  return (
    fuzzyMatch(query, model.name) ||
    fuzzyMatch(query, model.id) ||
    (!!model.provider && fuzzyMatch(query, model.provider))
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelPicker({
  models,
  recentModels = [],
  onSelect,
  onCancel,
  onConfigure,
  showGatewayBadge,
}: ModelPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // When there's no search query, show recents (deduplicated against main list)
  // at the top separated by a visual divider.
  const recentIds = useMemo(() => new Set(recentModels.map((m) => m.id)), [recentModels]);

  const filteredModels = useMemo(() => {
    if (!searchQuery) {
      // No query → recents first, then rest
      const rest = models.filter((m) => !recentIds.has(m.id));
      return [...recentModels, ...rest];
    }
    return models.filter((m) => modelMatchesQuery(m, searchQuery));
  }, [models, recentModels, recentIds, searchQuery]);

  // Ensure selectedIndex is within bounds
  const safeIndex = Math.min(selectedIndex, Math.max(0, filteredModels.length - 1));
  const scrollOffset = Math.max(0, safeIndex - PAGE_SIZE + 3);
  const visibleModels = filteredModels.slice(scrollOffset, scrollOffset + PAGE_SIZE);

  useInput((input, key) => {
    if (onConfigure && key.ctrl && input === 'g') {
      onConfigure();
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      if (filteredModels.length > 0) {
        const model = filteredModels[safeIndex];
        if (model) {
          onSelect(model);
        }
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(filteredModels.length - 1, prev + 1));
      return;
    }

    if (key.backspace || key.delete) {
      setSearchQuery((prev) => prev.slice(0, -1));
      setSelectedIndex(0);
      return;
    }

    // Type to search
    if (input && !key.ctrl && !key.meta) {
      setSearchQuery((prev) => prev + input);
      setSelectedIndex(0);
    }
  });

  const hasRecents = !searchQuery && recentModels.length > 0;

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Search bar */}
      <Box>
        <Text color="cyan" bold>
          ❯{' '}
        </Text>
        <Text dimColor>Search: </Text>
        <Text color="white" bold>
          {searchQuery || ''}
        </Text>
        <Text color="gray">{searchQuery ? '' : '(type to filter)'}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {filteredModels.length === 0 ? (
          <Text color="yellow">No models match "{searchQuery}"</Text>
        ) : (
          visibleModels.map((model, i) => {
            const actualIndex = scrollOffset + i;
            const isSelected = actualIndex === safeIndex;
            const isRecentItem = hasRecents && recentIds.has(model.id);

            // Insert "RECENTS" header before index 0 when in no-query mode
            const showRecentsHeader = hasRecents && actualIndex === 0;
            // Insert divider after the last recent item (before the regular list)
            const showDivider =
              hasRecents &&
              actualIndex === recentModels.length &&
              filteredModels.length > recentModels.length;

            return (
              <Box key={model.id + '-' + actualIndex} flexDirection="column">
                {showRecentsHeader && (
                  <Text color="yellow" dimColor>
                    {' '}
                    Recently used
                  </Text>
                )}
                {showDivider && (
                  <Text dimColor>─────────────────────────────────────────────────────</Text>
                )}
                <Box>
                  <Text color={isSelected ? 'cyan' : 'white'}>{isSelected ? '❯ ' : '  '}</Text>
                  <Box width={65} flexDirection="row">
                    <Text
                      color={isSelected ? 'cyan' : isRecentItem ? 'yellow' : 'white'}
                      bold={isSelected}
                    >
                      {model.name.length > 40 ? model.name.substring(0, 37) + '...' : model.name}
                    </Text>
                    {showGatewayBadge && model.gatewayInstance && (
                      <Text color="gray"> ({model.gatewayInstance.name})</Text>
                    )}
                  </Box>
                  {model.contextLength && (
                    <Box width={12}>
                      <Text dimColor>{formatContextLength(model.contextLength)}</Text>
                    </Box>
                  )}
                  {model.pricing && (
                    <Box>
                      <Text color="green" dimColor>
                        {model.pricing.prompt}
                      </Text>
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} • ↑↓ navigate •
          Enter select • Esc cancel{onConfigure ? ' • Ctrl+G configure' : ''}
        </Text>
      </Box>

      {/* Scroll indicator */}
      {filteredModels.length > PAGE_SIZE && (
        <Text dimColor>
          Showing {scrollOffset + 1}-{Math.min(scrollOffset + PAGE_SIZE, filteredModels.length)} of{' '}
          {filteredModels.length}
        </Text>
      )}
    </Box>
  );
}

function formatContextLength(len: number): string {
  if (len >= 1_000_000) return `${(len / 1_000_000).toFixed(0)}M ctx`;
  if (len >= 1000) return `${(len / 1000).toFixed(0)}k ctx`;
  return `${len} ctx`;
}
