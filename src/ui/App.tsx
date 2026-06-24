import { spawn } from 'child_process';
import chalk from 'chalk';
import { Box, render, Text, useApp } from 'ink';
import React, { useCallback, useEffect, useState } from 'react';
import type { AgentLauncher, ResolvedConfig } from '../agents/index.js';
import type { Gateway, GatewayInstance, ModelInfo } from '../gateways/index.js';
import {
  ALL_GATEWAYS,
  detectGatewayInstances,
  withGatewayEnv,
  withGatewayEnvAsync,
} from '../gateways/index.js';
import { getRecentModels, recordRecentModel } from '../recents.js';
import { GatewayPicker } from './GatewayPicker.js';
import { Header } from './Header.js';
import { LaunchConfirm } from './LaunchConfirm.js';
import { ModelPicker } from './ModelPicker.js';
import { ConfigureGatewayPicker } from './ConfigureGatewayPicker.js';
import { ConfigureGatewayInput } from './ConfigureGatewayInput.js';
import { loadFalconConfigV2, saveFalconConfigV2 } from '../config.js';
import { checkAgentInstalled } from '../utils.js';
import { InstallAgentPrompt } from './InstallAgentPrompt.js';

type AppState =
  | { phase: 'detect' }
  | { phase: 'install-prompt' }
  | { phase: 'gateway-manager'; instances: GatewayInstance[] }
  | { phase: 'configure-gateway-list'; title?: string }
  | { phase: 'configure-gateway-input'; gateway: Gateway; editingInstance?: GatewayInstance }
  | { phase: 'loading-models'; instances: GatewayInstance[] }
  | { phase: 'pick-model'; instances: GatewayInstance[]; models: ModelInfo[] }
  | {
      phase: 'confirm';
      gateway: GatewayInstance;
      model: ModelInfo;
      instances: GatewayInstance[];
      models: ModelInfo[];
    }
  | { phase: 'launching'; gateway: GatewayInstance; model: ModelInfo }
  | { phase: 'error'; message: string };

interface AppProps {
  agent: AgentLauncher;
  preselectedModel?: string;
  preselectedGateway?: string;
  extraArgs: string[];
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function App({ agent, preselectedModel, preselectedGateway, extraArgs }: AppProps) {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>({ phase: 'detect' });
  const [recentModels] = useState<ModelInfo[]>(() => getRecentModels());
  const normalizedPreselectedGateway = preselectedGateway?.toLowerCase();

  const launchAgent = useCallback(
    async (gateway: GatewayInstance, model: ModelInfo) => {
      recordRecentModel(model);
      setState({ phase: 'launching', gateway, model });

      const config = gateway.gateway.getEnvConfig(gateway.apiKey, model.id);
      let resolved: ResolvedConfig;

      try {
        resolved = await withGatewayEnvAsync({ fields: gateway.fields }, async () => {
          return await agent.resolveConfig(config, gateway.gateway.slug, gateway.apiKey, model.id);
        });
      } catch (err) {
        console.error(
          `\x1b[31mFailed to resolve config: ${err instanceof Error ? err.message : err}\x1b[0m`,
        );
        process.exit(1);
      }

      const spawnConfig = withGatewayEnv({ fields: gateway.fields }, () => {
        return agent.buildSpawnConfig(resolved, model.id, extraArgs);
      });

      const cleanUp = () => {
        if (spawnConfig.cleanup) {
          try {
            spawnConfig.cleanup();
          } catch (_) {}
        }
      };

      const handleSignalDuringLaunch = () => {
        cleanUp();
        process.exit(1);
      };

      process.on('SIGINT', handleSignalDuringLaunch);
      process.on('SIGTERM', handleSignalDuringLaunch);
      process.on('exit', cleanUp);

      setTimeout(() => {
        exit();

        setTimeout(async () => {
          process.off('SIGINT', handleSignalDuringLaunch);
          process.off('SIGTERM', handleSignalDuringLaunch);

          const ignoreSignal = () => {};
          process.on('SIGINT', ignoreSignal);
          process.on('SIGTERM', ignoreSignal);

          const isDetached = spawnConfig.detached === true;

          const proc = spawn(spawnConfig.command, spawnConfig.args, {
            stdio: isDetached ? 'ignore' : 'inherit',
            detached: isDetached,
            env: { ...process.env, ...gateway.fields, ...spawnConfig.env },
          });

          if (isDetached) {
            proc.unref();

            if (spawnConfig.afterSpawn) {
              try {
                await spawnConfig.afterSpawn(proc);
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(chalk.yellow(`Warning: post-launch hook failed: ${message}`));
              }
            }

            console.log(
              chalk.green(
                `\n🚀 ${agent.name} launched in detached background mode (PID: ${proc.pid}).`,
              ),
            );
            console.log(chalk.cyan(`To terminate/kill the process, run:\n  kill ${proc.pid}\n`));
            process.exit(0);
          }

          proc.on('error', (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error(chalk.red(`Failed to launch ${agent.name}: ${message}`));
            process.off('SIGINT', ignoreSignal);
            process.off('SIGTERM', ignoreSignal);
            cleanUp();
            process.exit(1);
          });

          proc.on('exit', (code: number | null) => {
            process.off('SIGINT', ignoreSignal);
            process.off('SIGTERM', ignoreSignal);
            cleanUp();
            process.exit(code ?? 0);
          });
        }, 100);
      }, 800);
    },
    [agent, extraArgs, exit],
  );

  useEffect(() => {
    if (state.phase !== 'detect') return;

    if (!checkAgentInstalled(agent.slug, agent.binaryName)) {
      setState({ phase: 'install-prompt' });
      return;
    }

    const instances = detectGatewayInstances();

    if (instances.length === 0) {
      if (normalizedPreselectedGateway) {
        const matchGateway = ALL_GATEWAYS.find((g) => g.slug === normalizedPreselectedGateway);
        if (matchGateway) {
          setState({ phase: 'configure-gateway-input', gateway: matchGateway });
          return;
        }
      }
      setState({ phase: 'configure-gateway-list' });
      return;
    }

    if (normalizedPreselectedGateway) {
      const match = instances.find(
        (inst) =>
          inst.gateway.slug === normalizedPreselectedGateway ||
          inst.name.toLowerCase() === normalizedPreselectedGateway,
      );
      if (match) {
        if (preselectedModel) {
          launchAgent(match, { id: preselectedModel, name: preselectedModel });
          return;
        }
        setState({ phase: 'loading-models', instances: [match] });
        return;
      }
    }

    if (preselectedModel && instances.length > 0) {
      const match = instances[0];
      if (match) {
        launchAgent(match, { id: preselectedModel, name: preselectedModel });
        return;
      }
    }

    setState({ phase: 'loading-models', instances });
  }, [launchAgent, normalizedPreselectedGateway, preselectedModel, state.phase, agent]);

  useEffect(() => {
    if (state.phase !== 'loading-models') return;
    const { instances } = state;

    const promises = instances.map(async (inst) => {
      try {
        const models = await withGatewayEnvAsync({ fields: inst.fields }, async () => {
          return await inst.gateway.listModels(inst.apiKey);
        });
        return models.map((m) => ({
          ...m,
          gatewayInstance: inst,
        }));
      } catch {
        return [];
      }
    });

    Promise.all(promises)
      .then((results) => {
        const allModels = results.flat();
        if (allModels.length === 0) {
          setState({
            phase: 'error',
            message:
              'Failed to load models from any configured gateways. Please check your configurations.',
          });
        } else {
          setState({ phase: 'pick-model', instances, models: allModels });
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setState({ phase: 'error', message: `Failed to load models: ${message}` });
      });
  }, [state]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header agent={agent} />

      {state.phase === 'detect' && (
        <Box marginTop={1}>
          <Text>
            <Text color="cyan">⠋</Text> Detecting API keys...
          </Text>
        </Box>
      )}

      {state.phase === 'install-prompt' && (
        <InstallAgentPrompt
          agent={agent}
          onConfigured={() => {
            setState({ phase: 'detect' });
          }}
          onCancel={() => exit()}
        />
      )}

      {state.phase === 'gateway-manager' && (
        <GatewayPicker
          instances={state.instances}
          onAdd={() => {
            setState({
              phase: 'configure-gateway-list',
              title: 'Select a provider to configure:',
            });
          }}
          onDelete={(instance) => {
            const config = loadFalconConfigV2();
            config.gateways = config.gateways.filter((g) => g.id !== instance.id);
            saveFalconConfigV2(config);
            const nextInstances = detectGatewayInstances();
            setState({ phase: 'gateway-manager', instances: nextInstances });
          }}
          onUpdate={(instance) => {
            setState({
              phase: 'configure-gateway-input',
              gateway: instance.gateway,
              editingInstance: instance,
            });
          }}
          onBack={() => {
            const current = detectGatewayInstances();
            if (current.length > 0) {
              setState({ phase: 'detect' });
            } else {
              exit();
            }
          }}
        />
      )}

      {state.phase === 'configure-gateway-list' && (
        <ConfigureGatewayPicker
          title={state.title}
          onSelect={(gw) => {
            setState({
              phase: 'configure-gateway-input',
              gateway: gw,
            });
          }}
          onCancel={() => {
            const detected = detectGatewayInstances();
            if (detected.length > 0) {
              setState({ phase: 'gateway-manager', instances: detected });
            } else {
              exit();
            }
          }}
        />
      )}

      {state.phase === 'configure-gateway-input' && (
        <ConfigureGatewayInput
          gateway={state.gateway}
          editingInstance={state.editingInstance}
          onConfigured={(newValues) => {
            const config = loadFalconConfigV2();
            const inst = state.editingInstance;
            if (inst) {
              const existing = config.gateways.find((g) => g.id === inst.id);
              if (existing) {
                existing.fields = newValues;
              }
            } else {
              const newInstanceId = `gw-${state.gateway.slug}-${Date.now()}`;
              config.gateways.push({
                id: newInstanceId,
                gatewaySlug: state.gateway.slug,
                fields: newValues,
              });
            }
            saveFalconConfigV2(config);

            setState({ phase: 'detect' });
          }}
          onCancel={() => {
            const detected = detectGatewayInstances();
            if (detected.length > 0) {
              setState({ phase: 'gateway-manager', instances: detected });
            } else {
              setState({ phase: 'configure-gateway-list' });
            }
          }}
        />
      )}

      {state.phase === 'loading-models' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color="green">✓</Text> Connected to{' '}
            <Text bold color="cyan">
              {state.instances.map((inst) => inst.name).join(', ')}
            </Text>
          </Text>
          <Box marginTop={1}>
            <LoadingSpinner text="Fetching available models..." />
          </Box>
        </Box>
      )}

      {state.phase === 'pick-model' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color="green">✓</Text> Connected to{' '}
            <Text bold color="cyan">
              {state.instances.map((inst) => inst.name).join(', ')}
            </Text>
            <Text dimColor> • {state.models.length} models available</Text>
          </Text>
          <ModelPicker
            models={state.models}
            recentModels={recentModels}
            showGatewayBadge={state.instances.length > 1}
            onSelect={(model) => {
              const targetInstance = model.gatewayInstance || state.instances[0];
              if (targetInstance) {
                setState({
                  phase: 'confirm',
                  gateway: targetInstance,
                  model,
                  instances: state.instances,
                  models: state.models,
                });
              }
            }}
            onCancel={() => exit()}
            onConfigure={() => {
              setState({ phase: 'gateway-manager', instances: state.instances });
            }}
          />
        </Box>
      )}

      {state.phase === 'confirm' && (
        <LaunchConfirm
          agent={agent}
          gateway={{ name: state.gateway.name, slug: state.gateway.gateway.slug }}
          model={state.model}
          onConfirm={() => launchAgent(state.gateway, state.model)}
          onCancel={() =>
            setState({
              phase: 'pick-model',
              instances: state.instances,
              models: state.models,
            })
          }
        />
      )}

      {state.phase === 'launching' && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color="green">✓</Text> Connected to{' '}
            <Text bold color="cyan">
              {state.gateway.name}
            </Text>
          </Text>
          <Text>
            <Text color="green">✓</Text> Model:{' '}
            <Text bold color="yellow">
              {state.model.name}
            </Text>
          </Text>
          <Box marginTop={1}>
            <Text color="magenta" bold>
              🚀 Launching {agent.name}...
            </Text>
          </Box>
        </Box>
      )}

      {state.phase === 'error' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red" bold>
            ✖ Error
          </Text>
          <Text color="red">{state.message}</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Ctrl+C to exit</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function LoadingSpinner({ text }: { text: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text>
      <Text color="cyan">{SPINNER_FRAMES[frame]}</Text> {text}
    </Text>
  );
}

export function renderApp(props: AppProps) {
  render(React.createElement(App, props));
}
