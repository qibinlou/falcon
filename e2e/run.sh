#!/usr/bin/env bash
# e2e/run.sh
# Run all Falcon e2e test suites and print a summary.
# Usage: bash e2e/run.sh
#        pnpm run e2e

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Test suites (ordered) ─────────────────────────────────────────────────────
SUITES=(
  "e2e/01-cli-contract.test.ts"
  "e2e/02-gateway-detect.test.ts"
  "e2e/04-models.test.ts"
  "e2e/05-interactive-install.test.ts"
  "e2e/06-codex-modalities.test.ts"
  "e2e/07-codex-app-multi-model.test.ts"
  "e2e/08-pi-agent.test.ts"
  "e2e/09-hermes-agent.test.ts"
)

SUITE_LABELS=(
  "01 · CLI Contract"
  "02 · Gateway Detection"
  "04 · Models API (live)"
  "05 · Interactive Install"
  "06 · Codex Modalities"
  "07 · Codex App Multi-Model"
  "08 · Pi Agent"
  "09 · Hermes Agent"
)

# ── Load .env if present ──────────────────────────────────────────────────────
if [ -f "$ROOT/.env" ]; then
  echo -e "${CYAN}Loading .env from project root…${RESET}"
  set -a
  # shellcheck disable=SC1090
  source "$ROOT/.env"
  set +a
fi

# ── Run suites ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}🦅  Falcon E2E Test Suite${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

PASS=0
FAIL=0
FAIL_NAMES=()

for i in "${!SUITES[@]}"; do
  SUITE="${SUITES[$i]}"
  LABEL="${SUITE_LABELS[$i]}"
  SUITE_PATH="$ROOT/$SUITE"

  echo -e "${BOLD}▸ ${LABEL}${RESET}"

  # Run the suite; capture output; preserve exit code without errexit killing us
  set +e
  OUTPUT=$(cd "$ROOT" && npx tsx --test "$SUITE_PATH" 2>&1)
  EXIT_CODE=$?
  set -e

  if [ $EXIT_CODE -eq 0 ]; then
    echo -e "  ${GREEN}✓ PASSED${RESET}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗ FAILED${RESET}"
    # Print the output indented for readability
    echo "$OUTPUT" | sed 's/^/    /'
    FAIL=$((FAIL + 1))
    FAIL_NAMES+=("$LABEL")
  fi
  echo ""
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
TOTAL=$((PASS + FAIL))
echo -e "${BOLD}Results: ${GREEN}${PASS}/${TOTAL} passed${RESET}"

if [ ${#FAIL_NAMES[@]} -gt 0 ]; then
  echo -e "${RED}Failed suites:${RESET}"
  for name in "${FAIL_NAMES[@]}"; do
    echo -e "  ${RED}✗ ${name}${RESET}"
  done
  echo ""
  exit 1
else
  echo -e "${GREEN}All suites passed! 🎉${RESET}"
  echo ""
  exit 0
fi
