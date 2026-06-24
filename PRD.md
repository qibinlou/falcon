## Principles
- LLM provider/gateway aganostic
- Agent harness agnostic
- Intuitive developer experience
- Minimal dependencies
- Optimize for privacy
- Enhance, but not replace the existing agent cli commands


## CLI Design Style
CLI commands design should follow docker's CLI design style.

## Supported Agents
- `codex` - OpenAI's Codex 
- `claude` - Anthropic's Claude Code

## CLI Design Notes
- falcon's local config path is `~/.falcon/`
- falcon's agent workspace folder is `~/.falcon/{agent}`, e.g. `~/.falcon/codex` and `~/.falcon/claude`


## Example Commands
- `OPENROUTER_API_KEY="sk-your-openrouter-api-key" falcon codex` should automatically launch codex in interactive mode with openrouter provider, though the user still needs to select a model to work with in TUI before launching codex. The Codex model catalog should use OpenRouter's live `/api/v1/models` response data as the canonical source for context window and modality metadata, with local caching to avoid repeated network calls.
- `falcon codex` should launch codex in interactive mode, though the user needs to first configurate an LLM provider, then select a model to work with in TUI before launching codex.
- `falcon claude -m deepseek/deepseek-v4-flash:free -p 'what is your model id/version'` should launch codex in non-interactive mode with deepseek/deepseek-v4-flash:free model.
- `falcon agentX {--any-flags} {any-args}` any args and flags supported by `agentX` should be respected and supported.
- `falcon --profile work-profile claude` provides a unified way to work with multiple profiles with all supported agents. For example, using the default profile for daily use, and using a budget-limited profile for agentic sessions whose cost might be unpredictable.  A profile can be a convinient way to "pin" some of the user's most frequently used models, for example, supporting three models to be avaialible when using claude instead of only one.
- `falcon --yolo codex` provides a unified way to set command behaviors among all supported agents, such as codex, claude code and opencode.
- `falcon --profile hosted-profile-with-corp-skills-and-mcps codex` should launch a codex agent with preconfigurated skills and MCP servers.


## Future Ideas
- `falcon --sandbox daytona claude` allows the user to configurate external sandbox provider and launch agent in that sandbox. By default, it's `local`. Planned sandbox integration: `daytona`, `vercel`, `docker`.
- `falcon --streaming claude` enables the user to stream their lcoal session to the internet via a streaming link
- `falcon wallet` manages a local cryoto wallet that can be used to fund LLM & sandbox resource usage and control spending budget per session.
