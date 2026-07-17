# 🦅 Falcon — Launch any coding agent with any LLM in absolute privacy.


[![npm version](https://img.shields.io/npm/v/falconsh?style=flat-square&color=0a0a0c)](https://www.npmjs.com/package/falconsh)
[![Agent: Codex](https://img.shields.io/badge/Agent-Codex-orange.svg?style=flat-square&color=00a67e)](https://github.com/openai/codex)
[![Agent: Claude Code](https://img.shields.io/badge/Agent-Claude%20Code-orange.svg?style=flat-square&color=cc9900)](https://docs.anthropic.com/en/docs/claude-code)
[![Agent: OpenCode](https://img.shields.io/badge/Agent-OpenCode-blue.svg?style=flat-square&color=3399ff)](https://opencode.ai)
[![LLM Providers: All](https://img.shields.io/badge/LLM%20Providers-All-brightgreen.svg?style=flat-square&color=16d3b4)](#-environment-configuration--api-gateways)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg?style=flat-square&color=6e5aff)](LICENSE)
[![Built with TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg?style=flat-square&color=3178c6)](https://www.typescriptlang.org/)
[![UI: Ink](https://img.shields.io/badge/UI-Ink%20%26%20React-red.svg?style=flat-square&color=ff5a5f)](https://github.com/vadimdemedes/ink)

Falcon is an elegant command-line interface (CLI) and interactive Terminal User Interface (TUI) orchestrator written in TypeScript. It wraps coding agents—specifically [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [OpenAI Codex CLI](https://github.com/openai/codex), [Codex Desktop App](https://chatgpt.com/codex/), and [OpenCode](https://opencode.ai)—and provides multi-gateway API support (OpenRouter, OpenAI, Anthropic, Cloudflare AI Gateway), allowing you to run any compatible model under any agent harness with zero configuration overhead and absolute privacy.

---

## 🎯 Why Falcon?

*   **API Gateway Abstraction**: No more memorizing gateway endpoints or manual token configurations. Falcon automatically maps models and manages API endpoints across OpenAI, Anthropic, OpenRouter, and Cloudflare AI Gateway.
*   **Bifrost Translation Engine**: Want to run Anthropic's Claude Code using an OpenAI API key? Or run Codex using an Anthropic endpoint? Falcon utilizes a built-in proxy engine (`@maximhq/bifrost`) under the hood to automatically translate Anthropic's messaging protocol to OpenAI's completion format and vice-versa.
*   **TUI Model Catalog Explorer**: Search and filter through hundreds of models in a rich, keyboard-navigable terminal interface. View context lengths, modalities, and token pricing directly before launching your agent. Falcon derives those details from live gateway catalogs and keeps a local cache for repeat launches.
*   **Security & Encryption**: Your API keys are encrypted at rest using platform-specific material and AES-256-CBC, stored securely under `~/.falcon/config.json`.
*   **Opt-Out Telemetry by Default**: Respects your privacy. Falcon automatically configures downstream agents to run in full privacy mode, disabling analytics, feedback prompts, telemetry, and non-essential external connections.
*   **Pass-Through Command Forwarding**: Respects native options. Any extra flag or argument passed to Falcon is forwarded directly to the underlying agent binary.

---

## 🚀 Quick Start

Ensure you have [Node.js](https://nodejs.org/) installed (v20+ required, v22+ recommended).

### 1. Installation & Usage

Falcon is published on npm as [`falconsh`](https://www.npmjs.com/package/falconsh). You can run it directly without installing, install it globally, or run/develop it from source.

#### Option A: Run directly with `npx` (No installation needed)
```bash
npx falconsh launch
```

#### Option B: Global Installation
Install the package globally:
```bash
# pnpm
pnpm add -g falconsh

# npm
npm install -g falconsh

# bun
bun add -g falconsh
```
Once installed, you can use the `falcon` command directly:
```bash
falcon launch
```

#### Option C: Run from Source (Development Setup)
```bash
git clone https://github.com/qibinlou/falcon.git
cd falcon

# Install dependencies using your preferred package manager:
pnpm install   # or npm install / bun install
```

### 2. Configure Your Keys

Falcon automatically detects keys from your environment. Simply set any of the following:

```bash
export OPENROUTER_API_KEY="sk-or-..."
export OPENAI_API_KEY="sk-proj-..."
export ANTHROPIC_API_KEY="sk-ant-..."
```

*(Alternatively, run in interactive mode to add and encrypt your gateway API keys via the TUI!)*

### 3. Examples

You can run Falcon using `npx falconsh` (or `pnpm dlx falconsh`), globally via `falcon`, or from source (using `pnpm run dev --` in place of `falcon`):

```bash
# Start in interactive mode to pick agent and LLM provider
falcon launch

# Shorthand to run Claude Code with interactive model picker
falcon claude

# Shorthand to run OpenCode
falcon opencode

# Shorthand to run Codex Desktop App
falcon codex-app

# Launch codex CLI with a specific model directly (skips TUI)
falcon codex -m claude-opus-4-8

# Launch claude with a specific model directly (skips TUI)
falcon claude --model chat-latest
```

---

## 💻 CLI Commands & Options Reference

### Commands

| Command | Description |
| :--- | :--- |
| `falcon launch [agent] [options] [agentArgs...]` | Launches a coding agent (e.g. `codex`, `claude`, or `opencode`) with options. |
| `falcon codex [options] [agentArgs...]` | Shorthand to launch OpenAI Codex CLI directly. |
| `falcon codex-app [options] [agentArgs...]` | Shorthand to launch Codex Desktop App directly. |
| `falcon claude [options] [agentArgs...]` | Shorthand to launch Claude Code directly. |
| `falcon opencode [options] [agentArgs...]` | Shorthand to launch OpenCode directly. |
| `falcon models [options]` | Query and list available models from detected API gateways. |

### Launch Options

| Option | Shorthand | Description |
| :--- | :--- | :--- |
| `--model <model>` | `-m` | Skip interactive picker and launch directly with the specified model name. |
| `--gateway <gateway>` | `-g` | Specific API gateway to route requests (`openrouter`, `openai`, `anthropic`, `cloudflare`). |
| `--list-gateways` | — | Display all detected API keys and active gateways, then exit. |

---

## 🔑 Environment Configuration & API Gateways

Falcon leverages environment variables to identify and initialize connections to various providers:

| Gateway | Env Variable(s) | Supported Features |
| :--- | :--- | :--- |
| **OpenRouter** | `OPENROUTER_API_KEY` | Fetches live model catalog (200+ models), prices, and context windows. Generates OpenAI and Anthropic compatible bridges. |
| **OpenAI** | `OPENAI_API_KEY`<br>`OPENAI_BASE_URL` (optional) | Live fetches native OpenAI/compatible catalog including reasoning models. |
| **Anthropic** | `ANTHROPIC_API_KEY`<br>`ANTHROPIC_BASE_URL` (optional) | Queries official Anthropic models with rich metadata catalog. |
| **Cloudflare AI Gateway** | `CLOUDFLARE_API_KEY` or `CF_API_KEY`<br>`CLOUDFLARE_ACCOUNT_ID`<br>`CLOUDFLARE_GATEWAY_ID` | Routes requests through Cloudflare's secure AI proxy, auto-injecting gateway custom headers. |

---

## 📂 Codebase & Architecture

Falcon is structured to make extending gateways and agents straightforward:

*   **[src/cli.ts](./src/cli.ts)**: Command line router and entry point utilizing Commander.js.
*   **[src/config.ts](./src/config.ts)**: Implements AES-256-CBC encryption to store credentials locally in `~/.falcon/config.json`.
*   **[src/agents/](./src/agents/)**: Agent wrappers implementing `AgentLauncher` profile compilation and launch arguments.
    *   [claude.ts](./src/agents/claude.ts): Disables Claude telemetry/feedback and forces full privacy.
*   [codex.ts](./src/agents/codex.ts): Enforces Codex CLI >= 0.134.0, updates Codex CLI's `config.toml` profile, writes `model.json` from OpenRouter catalog metadata, and disables analytics.
*   [codex-app.ts](./src/agents/codex-app.ts): Configures Codex Desktop App's top-level config keys, `auth.json`, and custom isolated catalog built from the same metadata source.
*   [codex-utils.ts](./src/agents/codex-utils.ts): Shared configuration helpers for Codex CLI and Desktop App launchers, including OpenRouter-backed context window and modality lookup with local caching.
    *   [opencode.ts](./src/agents/opencode.ts): Manages OpenCode's config directory and dynamically updates `opencode.json` config settings.
*   **[src/gateways/](./src/gateways/)**: Providers logic matching API payloads to model metadata lists.
*   **[src/ui/](./src/ui/)**: Reactive terminal components built on Ink and React.

---

## 🧩 Extending Falcon

### 1. Add a New Agent
1. Create a class implementing the `AgentLauncher` interface under `src/agents/`.
2. Define:
    *   `name`: Display name.
    *   `slug`: CLI identifier.
    *   `resolveConfig(...)`: Configure settings, environment variables, or start proxy bridges.
    *   `buildSpawnConfig(...)`: Define command execution arguments.
3. Add the instance to `ALL_AGENTS` inside [src/agents/index.ts](./src/agents/index.ts).

### 2. Add a New API Gateway
1. Create a class implementing the `Gateway` interface under `src/gateways/`.
2. Define:
    *   `name` & `slug`.
    *   `detectKey()`: Auto-detect API key variables.
    *   `listModels(apiKey)`: Fetch models from the endpoint.
    *   `getEnvConfig(apiKey, model)`: Construct the proxy environment routing details.
3. Add the instance to `ALL_GATEWAYS` inside [src/gateways/index.ts](./src/gateways/index.ts).

---

## 🛠️ Development & QA

Manage the development loop with the following scripts:

```bash
# Compile and check TypeScript types
pnpm run check:types

# Format and autofix codebase with Biome
pnpm run check:format

# Lint codebase with Biome
pnpm run check:lint

# Run all unit tests
pnpm run test

# Run end-to-end (e2e) tests
pnpm run e2e

# Compile production bundle
pnpm run build
```

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more details.
