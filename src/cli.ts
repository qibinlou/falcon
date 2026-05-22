import chalk from 'chalk';
import { Command } from 'commander';
import { ALL_AGENTS, findAgent } from './agents/index.js';
import { detectGatewayInstances, withGatewayEnv, withGatewayEnvAsync } from './gateways/index.js';
import { renderApp } from './ui/App.js';
import { formatCtx, maskString } from './utils.js';

const VERSION = '0.1.0';

const program = new Command()
  .name('falcon')
  .version(VERSION)
  .description(
    chalk.magenta('🦅 Falcon') + ' — Launch coding agents with multi-gateway API support',
  );

async function handleLaunch(
  agentName: string | undefined,
  agentArgs: string[] | undefined,
  options: {
    model?: string;
    gateway?: string;
    dryRun?: boolean;
  },
) {
  const extraArgs = agentArgs || [];

  // If no agent specified, show available agents
  if (!agentName) {
    console.log(chalk.magenta.bold('\n  🦅 Falcon — Available Agents\n'));
    for (const agent of ALL_AGENTS) {
      console.log(`  ${chalk.cyan('•')} ${chalk.bold(agent.name)} ${chalk.dim(`(${agent.slug})`)}`);
    }
    console.log();
    console.log(
      chalk.dim('  Usage: falcon launch <agent> [--model <model>] [--gateway <gateway>]\n'),
    );
    return;
  }

  const agent = findAgent(agentName);
  if (!agent) {
    console.error(
      chalk.red(
        `Unknown agent: "${agentName}". Available agents: ${ALL_AGENTS.map((a) => a.slug).join(', ')}`,
      ),
    );
    process.exit(1);
  }

  // Dry run mode
  if (options.dryRun) {
    const detected = detectGatewayInstances();
    const targetGateway = options.gateway;
    const gw = targetGateway
      ? detected.find(
          (d) =>
            d.gateway.slug === targetGateway ||
            d.name.toLowerCase() === targetGateway.toLowerCase(),
        )
      : detected[0];

    if (!gw) {
      console.error(chalk.red('No API gateway available for dry run.'));
      process.exit(1);
    }

    const model = options.model || 'interactive-selection';
    const config = gw.gateway.getEnvConfig(gw.apiKey, model);

    const resolved = await withGatewayEnvAsync({ fields: gw.fields }, async () => {
      return await agent.resolveConfig(config, gw.gateway.slug, gw.apiKey, model, {
        dryRun: true,
      });
    });
    const spawnConfig = withGatewayEnv({ fields: gw.fields }, () => {
      return agent.buildSpawnConfig(resolved, model, extraArgs);
    });

    console.log(chalk.bold('\nDry Run Configuration:\n'));
    console.log(`  Agent:   ${chalk.green(agent.name)}`);
    console.log(`  Gateway: ${chalk.cyan(gw.name)}`);
    console.log(`  Model:   ${chalk.yellow(model)}`);
    console.log(`  Command: ${chalk.dim(`${spawnConfig.command} ${spawnConfig.args.join(' ')}`)}`);
    console.log(chalk.bold('\n  Environment:'));
    for (const [key, value] of Object.entries(spawnConfig.env)) {
      const masked = maskString(value);
      console.log(`    ${chalk.dim(key)}=${chalk.dim(masked)}`);
    }
    console.log();
    return;
  }

  // Launch the interactive TUI
  renderApp({
    agent,
    preselectedModel: options.model,
    preselectedGateway: options.gateway,
    extraArgs,
  });
}

// Main launch command
program
  .command('launch')
  .argument('[agent]', 'Agent to launch (codex, claude)')
  .argument('[agentArgs...]', 'Arguments to pass to the agent')
  .option('-m, --model <model>', 'Model to use')
  .option(
    '-g, --gateway <gateway>',
    'API gateway to use (openrouter, openai, anthropic, cloudflare)',
  )
  .option('--dry-run', 'Show what would be launched without actually launching')
  .option('--list-gateways', 'List detected API gateways and exit')
  .allowUnknownOption(true)
  .description('Launch a coding agent with a specific model via an API gateway')
  .action(
    async (
      agentName: string | undefined,
      agentArgs: string[] | undefined,
      options: {
        model?: string;
        gateway?: string;
        dryRun?: boolean;
        listGateways?: boolean;
      },
    ) => {
      // List gateways mode
      if (options.listGateways) {
        const detected = detectGatewayInstances();
        if (detected.length === 0) {
          console.log(chalk.red('No API keys detected.'));
          console.log(
            chalk.dim(
              'Set one of: OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, CLOUDFLARE_API_KEY',
            ),
          );
          process.exit(1);
        }
        console.log(chalk.bold('\nDetected API Gateways:\n'));
        for (const { name, apiKey, isEnv } of detected) {
          const masked = maskString(apiKey);
          const typeStr = isEnv ? chalk.magenta(' [Env] [read-only]') : '';
          console.log(
            `  ${chalk.green('✓')} ${chalk.bold(name)} ${chalk.dim(`(${masked})`)}${typeStr}`,
          );
        }
        console.log();
        return;
      }

      await handleLaunch(agentName, agentArgs, options);
    },
  );

// Register each agent as a top-level command
for (const agent of ALL_AGENTS) {
  program
    .command(agent.slug)
    .argument('[agentArgs...]', 'Arguments to pass to the agent')
    .option('-m, --model <model>', 'Model to use')
    .option(
      '-g, --gateway <gateway>',
      'API gateway to use (openrouter, openai, anthropic, cloudflare)',
    )
    .option('--dry-run', 'Show what would be launched without actually launching')
    .allowUnknownOption(true)
    .description(`Launch ${agent.name} with a specific model via an API gateway`)
    .action(
      async (
        agentArgs: string[] | undefined,
        options: {
          model?: string;
          gateway?: string;
          dryRun?: boolean;
        },
      ) => {
        await handleLaunch(agent.slug, agentArgs, options);
      },
    );
}

// Models command — list available models from a gateway
program
  .command('models')
  .option('-g, --gateway <gateway>', 'API gateway to query')
  .description('List available models from detected API gateways')
  .action(async (options: { gateway?: string }) => {
    const detected = detectGatewayInstances();

    if (detected.length === 0) {
      console.error(chalk.red('No API keys detected.'));
      process.exit(1);
    }

    const targetGateway = options.gateway;
    const target = targetGateway
      ? detected.find(
          (d) =>
            d.gateway.slug === targetGateway ||
            d.name.toLowerCase() === targetGateway.toLowerCase(),
        )
      : detected[0];

    if (!target) {
      console.error(chalk.red(`Gateway "${options.gateway}" not found or no key set.`));
      process.exit(1);
    }

    console.log(chalk.dim(`\nFetching models from ${target.name}...\n`));

    try {
      const models = await withGatewayEnvAsync({ fields: target.fields }, async () => {
        return await target.gateway.listModels(target.apiKey);
      });
      console.log(chalk.bold(`${target.name} — ${models.length} models:\n`));

      for (const model of models.slice(0, 50)) {
        const ctx = model.contextLength ? chalk.dim(` (${formatCtx(model.contextLength)})`) : '';
        const price = model.pricing ? chalk.green(` ${model.pricing.prompt}`) : '';
        console.log(`  ${chalk.cyan(model.id)}${ctx}${price}`);
      }

      if (models.length > 50) {
        console.log(
          chalk.dim(
            `\n  ... and ${models.length - 50} more. Use 'falcon launch' for interactive search.\n`,
          ),
        );
      }
      console.log();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Failed to fetch models: ${message}`));
      process.exit(1);
    }
  });

program.parse();
