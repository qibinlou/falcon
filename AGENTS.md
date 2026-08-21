# 🦅 Falcon Agent Context & Developer Guide

Welcome, Agent! This document provides comprehensive context on the Falcon codebase, including user guides, CLI references, architecture details, and development guidelines, maximizing your session context efficiency.

---

## 📖 System Overview & Features

**Falcon** is a CLI and Terminal User Interface (TUI) tool written in TypeScript. It wraps coding agents—specifically [Codex CLI](https://github.com/openai/codex), [Codex Desktop App](https://chatgpt.com/codex/), [Claude Code](https://docs.anthropic.com/en/docs/claude-code), and [OpenCode](https://opencode.ai), and [Pi](https://pi.dev)—and provides multi-gateway API support (OpenRouter, OpenAI, Anthropic, Cloudflare AI Gateway, Kimi, and OpenAI Compatible custom endpoints), allowing you to launch coding agents with a single command.

### Key Features
- **Multi-gateway support** — Auto-detects API keys from OpenRouter, OpenAI, Anthropic, Cloudflare, Kimi, and custom OpenAI Compatible providers.
- **Interactive model picker** — Search/filter from hundreds of models in a rich TUI.
- **Gateway browser** — When multiple keys are set, choose which gateway to use.
- **Launch confirmation** — See model details (pricing, context window) before launching.
- **Pass-through args** — Extra CLI flags are forwarded to the underlying agent.

---

Read [PRD](./PRD.md) to learn more about product requirements and vision.

## 🚀 Quick Start

Falcon is published publicly on npm at [`falconsh`](https://www.npmjs.com/package/falconsh). You can run it without installing using:
```bash
npx falconsh launch <agent>
```
Or you can install it globally via `pnpm add -g falconsh` (or `npm install -g falconsh`) and run it using the `falcon` command directly.

To launch an agent using the interactive model picker:

```bash
# Set your API key
export OPENROUTER_API_KEY=sk-or-...
# or
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...

# Launch with interactive model picker
falcon launch codex
falcon launch codex-app
falcon launch claude
falcon launch opencode
falcon launch pi

# Launch with a specific model
falcon launch claude --model claude-sonnet-4-20250514
falcon launch codex --model gpt-4o

# Specify gateway explicitly
falcon launch codex --gateway openrouter --model anthropic/claude-sonnet-4-20250514
```

---

## 💻 CLI Command Reference

### Commands

```bash
falcon launch [agent] [options]    # Launch a coding agent
falcon models [options]            # List available models from detected API gateways
falcon --help                      # Show help
```

### Options for `launch` command

| Flag | Description |
| :--- | :--- |
| `-m, --model <model>` | Model to use (skips interactive picker) |
| `-g, --gateway <gateway>` | API gateway to use (`openrouter`, `openai`, `anthropic`, `cloudflare`, `kimi`, `openai-compatible`) |
| `--list-gateways` | List detected API gateways and exit |

---

## 🔑 Environment Configuration & Gateways

Falcon detects and initializes gateways based on the presence of specific environment variables:

| Gateway | Env Variable | Features |
| :--- | :--- | :--- |
| **OpenRouter** | `OPENROUTER_API_KEY` | Live model listing from API, 200+ models. Sets up OpenAI and Anthropic compatible environment variables for Codex/Claude routing. |
| **OpenAI** | `OPENAI_API_KEY` | Live model listing, native GPT/o-series/Codex models. |
| **Anthropic** | `ANTHROPIC_API_KEY` | Hardcoded fallback model catalog for Claude models (since Anthropic lacks a public model listing API). |
| **Cloudflare AI Gateway** | `CLOUDFLARE_API_KEY` or `CF_API_KEY` | Proxy to multiple providers based on `CLOUDFLARE_ACCOUNT_ID`/`CF_ACCOUNT_ID` and `CLOUDFLARE_GATEWAY_ID`/`CF_GATEWAY_ID`. |
| **Kimi** | `MOONSHOT_API_KEY` | Native Moonshot AI Kimi API endpoints compatibility. |
| **OpenAI Compatible** | `OPENAI_COMPATIBLE_API_KEY` (optional) | Custom endpoints (Ollama, LM Studio) dynamically resolved by name and base URL. |

### 🛠️ Agent-Specific Side-Effects

*   **Codex**: Enforces a minimum Codex CLI version of `0.134.0`. Resolves target directory via `process.env.CODEX_HOME` (defaulting to `~/.codex/`). Modifies `config.toml` profile sections `[profiles.falcon]` and `[model_providers.<hostname>]`, and updates the list in `model.json`.
*   **Codex Desktop App**: Resolves configuration directory under `process.env.FALCON_DIR/codex-app` or `~/.falcon/codex-app`. Dynamically manages top-level keys in `config.toml`, parses `model.json`, and persists key auth in `auth.json`.
*   **Claude Code**: Directly relies on environment variables (`ANTHROPIC_API_KEY` or custom compatible endpoints like `ANTHROPIC_BASE_URL` mapped by the active gateway).
*   **OpenCode**: Resolves config directory via `process.env.OPENCODE_CONFIG_DIR` (defaulting to `~/.falcon/opencode/` or using `FALCON_DIR`) and updates the `opencode.json` configuration settings.
*   **Pi**: Resolves config directory via `PI_AGENT_DIR` (defaulting to `~/.falcon/pi/` or using `FALCON_DIR`) and registers a `falcon` provider in pi's `models.json`. The API key is referenced via `$FALCON_PI_API_KEY` env interpolation so it is never persisted to disk. Disables update checks (`PI_SKIP_VERSION_CHECK=1`) and telemetry (`PI_TELEMETRY=0`). Converts Falcon's `-p/--prompt` to pi's print mode.

---

## 📂 Repository Architecture

Here is how the codebase is structured:

*   **[src/cli.ts](./src/cli.ts)**: The primary entry point. Parses CLI commands and options using Commander, or initiates the interactive TUI.
*   **[src/constants.ts](./src/constants.ts)**: Contains project-wide constants, default configuration values, gateway URLs, and environment variable keys.
*   **[src/agents/](./src/agents/)**: Directory containing agent interfaces and wrappers.
    *   **[src/agents/index.ts](./src/agents/index.ts)**: Declares the [Agent](./src/agents/index.ts#L3) interface and the `ALL_AGENTS` registry list.
    *   **[src/agents/codex.ts](./src/agents/codex.ts)**: Wrapper for Codex. Dynamically generates or updates Codex's configuration files (profiles and providers in `~/.codex/config.toml`) and the local model catalog (`~/.codex/model.json`).
    *   **[src/agents/codex-app.ts](./src/agents/codex-app.ts)**: Wrapper for Codex Desktop App. Dynamically generates or updates configuration files and `auth.json` key-based credentials for the Electron app.
    *   **[src/agents/codex-utils.ts](./src/agents/codex-utils.ts)**: Extracted configuration helpers shared by both Codex CLI and Desktop App launchers.
    *   **[src/agents/claude.ts](./src/agents/claude.ts)**: Wrapper for Claude Code. Passes `--dangerously-skip-permissions` to bypass prompts in sandbox environments.
    *   **[src/agents/opencode.ts](./src/agents/opencode.ts)**: Wrapper for OpenCode. Dynamically generates or updates the local `opencode.json` config settings.
    *   **[src/agents/pi.ts](./src/agents/pi.ts)**: Wrapper for Pi. Dynamically generates or updates the local `models.json` provider config.
*   **[src/gateways/](./src/gateways/)**: Directory containing API gateways/proxies.
    *   **[src/gateways/index.ts](./src/gateways/index.ts)**: Declares the [Gateway](./src/gateways/index.ts#L19) interface, [ModelInfo](./src/gateways/index.ts#L3), and the `ALL_GATEWAYS` registry list.
    *   **[src/gateways/openrouter.ts](./src/gateways/openrouter.ts)**: Live fetches models from OpenRouter's HTTP endpoint. Sets up OpenAI and Anthropic compatible environment variables for Codex/Claude routing.
    *   **[src/gateways/openai.ts](./src/gateways/openai.ts)**: Fetches and filters OpenAI models (GPT/o-series/Codex).
    *   **[src/gateways/openai-custom.ts](./src/gateways/openai-custom.ts)**: Base reusable gateway class for any OpenAI-compatible provider.
    *   **[src/gateways/kimi.ts](./src/gateways/kimi.ts)**: Native Kimi API gateway.
    *   **[src/gateways/openai-compatible.ts](./src/gateways/openai-compatible.ts)**: OpenAI Compatible custom gateway.
    *   **[src/gateways/anthropic.ts](./src/gateways/anthropic.ts)**: Hardcoded fallback model catalog for Claude models (since Anthropic lacks a public model listing API).
    *   **[src/gateways/cloudflare.ts](./src/gateways/cloudflare.ts)**: Proxies requests to other providers through Cloudflare AI Gateway based on Account and Gateway IDs.
*   **[src/ui/](./src/ui/)**: React components utilizing Ink to build TUI states:
    *   **[App.tsx](./src/ui/App.tsx)**: The main TUI state machine (detects keys -> picks gateway -> loads models -> picks model -> confirms -> launches agent).
    *   **[GatewayPicker.tsx](./src/ui/GatewayPicker.tsx)**: List selection UI for detected API gateways.
    *   **[ModelPicker.tsx](./src/ui/ModelPicker.tsx)**: Filterable list selection UI for models.
    *   **[LaunchConfirm.tsx](./src/ui/LaunchConfirm.tsx)**: Shows environment variable mappings and CLI command confirmation.
    *   **[Header.tsx](./src/ui/Header.tsx)**: Layout header logo.
    

---

## 🛠️ Development

```bash
# Setup
pnpm install

# Dev Mode
pnpm run dev -- launch <agent> [options] [agentArgs...]

# Production Build
pnpm run build

# Start Build Output
node dist/cli.js launch <agent> [options]

# Istall globally on current device
pnpm add -g .
```

### 🐳 Dev Container Network Access to Host

When running Falcon inside a Docker container (such as a VS Code Dev Container) and trying to access an OpenAI Compatible endpoint running on your local host machine (such as LM Studio or Ollama):

- **Localhost Boundary**: `localhost` and `127.0.0.1` resolve to the container itself.
- **Accessing Host**: Use `http://host.docker.internal:<port>/v1` as the API Base URL (e.g. `http://host.docker.internal:1234/v1` for LM Studio, or `http://host.docker.internal:11434/v1` for Ollama).
- **Linux Docker Host Resolution**: If `host.docker.internal` does not resolve natively, ensure you add the run argument `--add-host=host.docker.internal:host-gateway` to your container configuration.

---

## 🧩 Extending Falcon

### How to Add a New Agent
1. Create a new class implementing the [Agent](./src/agents/index.ts#L3) interface in a new file under `src/agents/`.
2. Implement:
    *   `name`: Display name.
    *   `slug`: CLI argument identifier.
    *   `command`: Main binary executable name (e.g., `codex`, `claude`).
    *   `buildArgs(model, extraArgs)`: Array of command-line arguments to pass.
    *   `getRequiredEnv(gatewayConfig, model)`: Environment variables necessary to run.
3. Register your class instance in `ALL_AGENTS` inside [src/agents/index.ts](./src/agents/index.ts).

### How to Add a New Gateway
1. Create a new class implementing the [Gateway](./src/gateways/index.ts#L19) interface in a new file under `src/gateways/`.
2. Implement:
    *   `name`: Display name.
    *   `slug`: Internal identifier.
    *   `detectKey()`: Reads target API keys from `process.env`.
    *   `listModels(apiKey)`: Fetches or returns models list mapping to [ModelInfo](./src/gateways/index.ts#L3).
    *   `getEnvConfig(apiKey, model)`: Builds base URL and env dictionary.
3. Register your class instance in `ALL_GATEWAYS` inside [src/gateways/index.ts](./src/gateways/index.ts).

---

## 🔍 Debugging & Tips for Future Agents

*   **Bypassing TUI in Headless Environments**: Always pass `-m <model>` and `-g <gateway>` parameters if you are launching the agent inside an automated pipeline or remote shell where TUI keyboard interaction is impossible.
*   **Codex Config Reset**: If Codex has login status or parsing failures, check the file structure of `$CODEX_HOME/.codex/config.toml` and verify if the `[profiles.falcon]` profile section matches the gateway URL.
*   **API Model 404 Errors**: Be aware that certain providers may fail if the active model lacks specific features (like tool use support) under the selected gateway. Ensure you pick compatible models.


## Agentic Workflow Rules
- **CRITICAL**: Use TDD as your primary development approach. You MUST write or update a test demonstrating the failure BEFORE modifying implementation files. No logic/implementation changes are permitted without a corresponding new/updated test (unit or E2E).
- **Testing UI/Interactive Flows**: If a change involves interactive UI (like React Ink / TUI), and unit testing the UI wrapper is too complex:
  1. Refactor/extract the underlying non-UI logic into a helper function and unit test that helper.
  2. Or, add an E2E test that drives the CLI interactively using mock stdin inputs.
  3. Never skip writing tests under the assumption that "UI code is too hard to test."
- Don't run `pnpm run build` or `pnpm run dev` unless explicitly asked.
- Don't run lint/types/format tasks in the middle of your work; only run them before wrapping up and handing over back to the user. Run `pnpm run check:all` to run all checks in one go to save time and tokens.
- I haven't release the software to public yet, so it's safe to make breaking changes if needed.
- When explicitly asked to create a commit, use the co-author approach by adding a `Co-authored-by:` trailer at the end of the commit message.
- Run `loadenv` command when you run into API key related env issues. Run `clearenv` command to clear the keys loaded before.
