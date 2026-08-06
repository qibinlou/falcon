# Codex Desktop App: Native Multi-Profile Model Catalog

## Outcome

The current Codex Desktop build can run beside an existing Codex window and show third-party models in its native model selector without changing the renderer bundle or patching Statsig local storage.

The working approach is:

1. Give the new Electron process a separate `--user-data-dir`.
2. Give it a separate `CODEX_HOME` under Falcon's managed directory.
3. Write a native-shaped `model.json` catalog and a deliberately stale `models_cache.json`.
4. Configure the selected provider and catalog through top-level Codex configuration keys.
5. Preserve native ChatGPT authentication metadata for the Desktop UI, while routing requests through the gateway's `OPENAI_API_KEY` environment variable.

## Root cause of the old behavior

The former implementation used a local CDP debugging port to rewrite a Statsig evaluation in the renderer. That was fragile because a fresh profile has no Statsig cache to patch, and it coupled Falcon to private app internals. It also made the selector appear as `Custom` or limited it to the model selected at launch.

The native catalog path is more stable: the desktop app's app-server reads `model_catalog_json`, returns the catalog rows through `model/list`, and the renderer displays those rows when the profile has native ChatGPT auth metadata.

An API-key-only `auth.json` was sufficient to route requests but did not reliably populate the desktop model picker. Copying the primary profile's native ChatGPT auth object into the isolated profile fixes that UI requirement. The provider still uses `env_key = "OPENAI_API_KEY"`, so the copied ChatGPT tokens are not used for third-party requests.

## Implementation map

- `src/agents/codex-app.ts`
  - Resolves the installed ChatGPT Desktop executable.
  - Launches with a per-profile `--user-data-dir` and no automatic debugging port.
  - Writes isolated auth, native top-level config, the catalog, and the native cache.
- `src/agents/codex-utils.ts`
  - Normalizes catalog rows with the fields expected by current Codex builds.
  - Accepts the complete selected gateway catalog, deduplicates it, and places the selected model first.
- `src/agents/model-catalog.ts`
  - Loads a gateway catalog only for launchers that declare `modelCatalogMode: 'gateway'`.
  - Treats discovery failure as non-fatal so a selected model can still launch.
- `src/cli.ts` and `src/ui/App.tsx`
  - Pass the full gateway catalog into the desktop launcher for both direct and interactive launches.
- `src/agents/codex-app-statsig.ts`
  - Removed; no renderer-local-storage or CDP model-label patch is needed.

The selected model is placed first because the current renderer requests a bounded model list. The catalog writer currently keeps the first 100 rows useful to the selector while retaining the full native catalog on disk.

## Verification performed

- Focused launcher, catalog, utility, and catalog-loader tests passed.
- The complete TypeScript test suite passed: 137 tests, 0 failures.
- The Codex Desktop multi-model E2E test passed with an isolated mock executable.
- A macOS live check with a clean secondary profile observed:
  - a native catalog containing hundreds of OpenRouter rows;
  - the selected model first in both `model.json` and `models_cache.json`;
  - native ChatGPT auth metadata in the isolated profile;
  - empty Statsig model configuration/local-storage entries;
  - the actual selector showing rows such as `openrouter/free - openrouter` and other provider models;
  - a successful third-party model response through the configured provider;
  - the primary Codex process remaining running at the same time.

No credentials, account identifiers, usernames, or machine-specific paths are included in this document.

## Follow-up work

1. Run the repository's final `pnpm run check:all` (types, formatting, and lint) and address any issues it reports.
2. Replace or update the older `docs/codex-desktop-multi-model-patch.md`, which still documents the retired Statsig/CDP approach.
3. Stop the disposable live QA app and remove temporary test-only auth/config artifacts after collecting any needed evidence.
4. Consider adding a detached-spawn error listener before `unref()` so a missing desktop executable cannot be reported as a successful launch.
5. Re-run the live check after any formatting or follow-up code change, keeping the primary Codex profile untouched.
