# 🦅 Falcon Agent Context & Developer Guide

Welcome, Agent! This document provides comprehensive context on the Falcon codebase, including user guides, CLI references, architecture details, and development guidelines, maximizing your session context efficiency.

---

## 📖 System Overview & Features

**Falcon** is a CLI and Terminal User Interface (TUI) tool written in TypeScript. It wraps coding agents—specifically [Codex](https://github.com/openai/codex) and [Claude Code](https://docs.anthropic.com/en/docs/claude-code)—and provides multi-gateway API support (OpenRouter, OpenAI, Anthropic, Cloudflare AI Gateway), allowing you to launch coding agents with a single command.

### Key Features
- **Multi-gateway support** — Auto-detects API keys from OpenRouter, OpenAI, Anthropic, and Cloudflare.
- **Interactive model picker** — Search/filter from hundreds of models in a rich TUI.
- **Gateway browser** — When multiple keys are set, choose which gateway to use.
- **Launch confirmation** — See model details (pricing, context window) before launching.
- **Dry run mode** — Preview the exact command and env vars that will be used.
- **Pass-through args** — Extra CLI flags are forwarded to the underlying agent.

---

Read [PRD](./PRD.md) to learn more about product requirements and vision.

## 🚀 Quick Start

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
falcon launch claude

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
| `-g, --gateway <gateway>` | API gateway to use (`openrouter`, `openai`, `anthropic`, `cloudflare`) |
| `--dry-run` | Show what would be launched without actually launching |
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

### 🛠️ Agent-Specific Side-Effects

*   **Codex**: Resolves target directory via `process.env.CODEX_HOME` (defaulting to `~/.codex/`). Modifies `config.toml` profile sections `[profiles.falcon]` and `[model_providers.<hostname>]`, and updates the list in `model.json`.
*   **Claude Code**: Directly relies on environment variables (`ANTHROPIC_API_KEY` or custom compatible endpoints like `ANTHROPIC_BASE_URL` mapped by the active gateway).

---

## 📂 Repository Architecture

Here is how the codebase is structured:

*   **[src/cli.ts](file:///home/sprite/falcon/src/cli.ts)**: The primary entry point. Parses CLI commands and options using Commander, runs dry runs, or initiates the interactive TUI.
*   **[src/agents/](file:///home/sprite/falcon/src/agents/)**: Directory containing agent interfaces and wrappers.
    *   **[src/agents/index.ts](file:///home/sprite/falcon/src/agents/index.ts)**: Declares the [Agent](file:///home/sprite/falcon/src/agents/index.ts#L3) interface and the `ALL_AGENTS` registry list.
    *   **[src/agents/codex.ts](file:///home/sprite/falcon/src/agents/codex.ts)**: Wrapper for Codex. Dynamically generates or updates Codex's configuration files (profiles and providers in `~/.codex/config.toml`) and the local model catalog (`~/.codex/model.json`).
    *   **[src/agents/claude.ts](file:///home/sprite/falcon/src/agents/claude.ts)**: Wrapper for Claude Code. Passes `--dangerously-skip-permissions` to bypass prompts in sandbox environments.
*   **[src/gateways/](file:///home/sprite/falcon/src/gateways/)**: Directory containing API gateways/proxies.
    *   **[src/gateways/index.ts](file:///home/sprite/falcon/src/gateways/index.ts)**: Declares the [Gateway](file:///home/sprite/falcon/src/gateways/index.ts#L19) interface, [ModelInfo](file:///home/sprite/falcon/src/gateways/index.ts#L3), and the `ALL_GATEWAYS` registry list.
    *   **[src/gateways/openrouter.ts](file:///home/sprite/falcon/src/gateways/openrouter.ts)**: Live fetches models from OpenRouter's HTTP endpoint. Sets up OpenAI and Anthropic compatible environment variables for Codex/Claude routing.
    *   **[src/gateways/openai.ts](file:///home/sprite/falcon/src/gateways/openai.ts)**: Fetches and filters OpenAI models (GPT/o-series/Codex).
    *   **[src/gateways/anthropic.ts](file:///home/sprite/falcon/src/gateways/anthropic.ts)**: Hardcoded fallback model catalog for Claude models (since Anthropic lacks a public model listing API).
    *   **[src/gateways/cloudflare.ts](file:///home/sprite/falcon/src/gateways/cloudflare.ts)**: Proxies requests to other providers through Cloudflare AI Gateway based on Account and Gateway IDs.
*   **[src/ui/](file:///home/sprite/falcon/src/ui/)**: React components utilizing Ink to build TUI states:
    *   **[App.tsx](file:///home/sprite/falcon/src/ui/App.tsx)**: The main TUI state machine (detects keys -> picks gateway -> loads models -> picks model -> confirms -> launches agent).
    *   **[GatewayPicker.tsx](file:///home/sprite/falcon/src/ui/GatewayPicker.tsx)**: List selection UI for detected API gateways.
    *   **[ModelPicker.tsx](file:///home/sprite/falcon/src/ui/ModelPicker.tsx)**: Filterable list selection UI for models.
    *   **[LaunchConfirm.tsx](file:///home/sprite/falcon/src/ui/LaunchConfirm.tsx)**: Shows environment variable mappings and CLI command confirmation.
    *   **[Header.tsx](file:///home/sprite/falcon/src/ui/Header.tsx)**: Layout header logo.

---

## 🛠️ Development

```bash
# Setup
npm install

# Dev Mode
npm run dev -- launch <agent> [options] [agentArgs...]
# Example: npm run dev -- launch codex -m deepseek/deepseek-v4-flash:free --dry-run

# Production Build
npm run build

# Start Build Output
node dist/cli.js launch <agent> [options]
```

---

## 🧩 Extending Falcon

### How to Add a New Agent
1. Create a new class implementing the [Agent](file:///home/sprite/falcon/src/agents/index.ts#L3) interface in a new file under `src/agents/`.
2. Implement:
    *   `name`: Display name.
    *   `slug`: CLI argument identifier.
    *   `command`: Main binary executable name (e.g., `codex`, `claude`).
    *   `buildArgs(model, extraArgs)`: Array of command-line arguments to pass.
    *   `getRequiredEnv(gatewayConfig, model)`: Environment variables necessary to run.
3. Register your class instance in `ALL_AGENTS` inside [src/agents/index.ts](file:///home/sprite/falcon/src/agents/index.ts).

### How to Add a New Gateway
1. Create a new class implementing the [Gateway](file:///home/sprite/falcon/src/gateways/index.ts#L19) interface in a new file under `src/gateways/`.
2. Implement:
    *   `name`: Display name.
    *   `slug`: Internal identifier.
    *   `detectKey()`: Reads target API keys from `process.env`.
    *   `listModels(apiKey)`: Fetches or returns models list mapping to [ModelInfo](file:///home/sprite/falcon/src/gateways/index.ts#L3).
    *   `getEnvConfig(apiKey, model)`: Builds base URL and env dictionary.
3. Register your class instance in `ALL_GATEWAYS` inside [src/gateways/index.ts](file:///home/sprite/falcon/src/gateways/index.ts).

---

## 🔍 Debugging & Tips for Future Agents

*   **Always Dry Run First**: When diagnosing startup crashes or parameter errors, use `--dry-run`. It avoids starting the interactive TUI and lists the generated command string and injected environment variables clearly:
    ```bash
    npm run dev -- launch codex -m gpt-4o --dry-run
    ```
*   **Bypassing TUI in Headless Environments**: Always pass `-m <model>` and `-g <gateway>` parameters if you are launching the agent inside an automated pipeline or remote shell where TUI keyboard interaction is impossible.
*   **Codex Config Reset**: If Codex has login status or parsing failures, check the file structure of `$CODEX_HOME/.codex/config.toml` and verify if the `[profiles.falcon]` profile section matches the gateway URL.
*   **API Model 404 Errors**: Be aware that certain providers may fail if the active model lacks specific features (like tool use support) under the selected gateway. Ensure you pick compatible models.


## Agentic Workflow Rules
- Don't run `npm run build` or `npm run dev` unless explicitly asked.
- I haven't release the software to public yet, so it's safe to make breaking changes if needed.
- When explicitly asked to create a commit, use the co-author approach by adding a `Co-authored-by:` trailer at the end of the commit message.
