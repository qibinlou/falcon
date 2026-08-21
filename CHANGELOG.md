# Changelog

## 1.0.0 (2026-08-21)


### Features

* add detached mode support for agent processes and enforce stricter TDD guidelines for UI components ([a3a295e](https://github.com/qibinlou/falcon/commit/a3a295e3730ad490951c9627274a4e8d1a8c1693))
* add Kimi and generic OpenAI-compatible gateway support ([0263e3c](https://github.com/qibinlou/falcon/commit/0263e3c30b7e004f33284a3c4ca29096db680caa))
* add Kimi gateway support via OpenAICustomGateway integration ([30a4c92](https://github.com/qibinlou/falcon/commit/30a4c9259099f3a914d7cd4952f51f8f9ed5155d))
* add OpenAICompatibleGateway with support for custom base URLs and dynamic endpoint configuration ([d361742](https://github.com/qibinlou/falcon/commit/d361742ba1cdb2d82dc98e8a6ea7b36622880664))
* add OpenCode agent support, fix its tests, and remove agy agent references ([b6cacf6](https://github.com/qibinlou/falcon/commit/b6cacf6dd88d8aeed314f5489eed7fe104f0ba1e))
* add Pi coding agent support and integrate into CLI and agent registry ([d412ed1](https://github.com/qibinlou/falcon/commit/d412ed1bb047923797107afd0fe8650ac3a2562c))
* add post-spawn hook for model label patching and implement CLI sensitive data masking ([ef8ad86](https://github.com/qibinlou/falcon/commit/ef8ad8635fcf4e8cfb90364d85b4d721dba2887d))
* add support for Codex Desktop App with shared utility logic and documentation updates ([715870e](https://github.com/qibinlou/falcon/commit/715870e9cc7aa4676390f990ad1563a29f56fca5))
* add support for OpenCode agent integration ([77afddd](https://github.com/qibinlou/falcon/commit/77afdddbe83191628fae9aa5adb530ea9714f489))
* disable telemetry, auto-updates, and sharing in OpenCode configuration ([b55b215](https://github.com/qibinlou/falcon/commit/b55b2159a46f4cf63be35ccb6be5bca5e89651cd))
* enable direct agent command forwarding and implement argument pre-processing for agent help flags ([78e4ced](https://github.com/qibinlou/falcon/commit/78e4ced6afe512ca7ba416939239801d95072860))
* enable gateway model discovery for openrouter in Claude agent configuration ([5dada12](https://github.com/qibinlou/falcon/commit/5dada1244d18114cd54902bdbfbf60a3f608c441))
* enable multi-model switching by patching all catalog models into the Statsig allow-list at launch ([11e06e0](https://github.com/qibinlou/falcon/commit/11e06e0e678e348ac3e7cbf6c8537c2a8656e5fb))
* enforce minimum Codex CLI version 0.134.0 during configuration resolution ([2713ecd](https://github.com/qibinlou/falcon/commit/2713ecd056e0b92decff3b9819a7f9959fab7ce2))
* enhance PiLauncher to handle model merging and improve config file management ([755b64c](https://github.com/qibinlou/falcon/commit/755b64cc144779457c8024f564275bf90ba873b4))
* implement argument parsing for model and gateway flags and enable non-interactive prompt execution in codex agent ([a4ed14e](https://github.com/qibinlou/falcon/commit/a4ed14e19848773a3f8663b0560b4c730a568e31))
* implement CodexAppLauncher for isolated desktop application execution ([b13fcb2](https://github.com/qibinlou/falcon/commit/b13fcb2e460aff580d58a9164fd559e7f868b1ca))
* implement detached background execution for app launcher and add debugger abort logic to E2E polling. ([1c491b8](https://github.com/qibinlou/falcon/commit/1c491b8c53905b0455aeef5838ca1de0b1380998))
* implement interactive installation prompt for missing agent binaries with custom path configuration and clipboard support ([d610c8a](https://github.com/qibinlou/falcon/commit/d610c8a3bd7d731b2cbc316a02e435c2d0e8457f))
* implement multi-model switcher and update display labeling format to {model_id} - {gateway_name} in Codex Desktop ([89b5b44](https://github.com/qibinlou/falcon/commit/89b5b44b9f443227f3b17b357d938d7e2354238d))
* sanitize codex modalities to support only text and image inputs and add E2E verification ([9f4f865](https://github.com/qibinlou/falcon/commit/9f4f865a7a647ddeb91ec4020146fa399067cbc1))
* simplify workspace configuration design by isolating agent environments ([3bb75cb](https://github.com/qibinlou/falcon/commit/3bb75cb2670b15e9d0f1696fee354c94ed0921d6))
* support ChatGPT desktop app as default and update build target to node24 ([03afc1e](https://github.com/qibinlou/falcon/commit/03afc1ee06fe3d6c5429aadd4ad9325af83adfae))
* update Claude launch scripts to include system prompts and add a dedicated haiku launch command ([93a160e](https://github.com/qibinlou/falcon/commit/93a160e31a3719e8dde6b9279330875af1abff5d))
* update version to 1.1.0, standardize OpenRouter configurations, and enhance CLI help formatting ([938bebf](https://github.com/qibinlou/falcon/commit/938bebf656af6f5a8f31dcffadc9a9cf8c5e04b7))


### Bug Fixes

* **e2e:** isolate test environment from base URL and config overrides ([a608df5](https://github.com/qibinlou/falcon/commit/a608df58e9876f1529b8ef6a09d2139e7c9a5e47))
