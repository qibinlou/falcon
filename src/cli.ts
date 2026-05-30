import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { Command } from 'commander';
import { ALL_AGENTS, findAgent } from './agents/index.js';
import { detectGatewayInstances, withGatewayEnvAsync } from './gateways/index.js';
import { renderApp } from './ui/App.js';
import { formatCtx, maskString } from './utils.js';

if (process.env.FALCON_E2E_TEST === 'true') {
  Object.defineProperty(process.stdin, 'isTTY', {
    value: true,
    configurable: true,
    writable: true,
  });
  if (!process.stdin.setRawMode) {
    Object.defineProperty(process.stdin, 'setRawMode', {
      value: function (this: unknown) {
        return this;
      },
      configurable: true,
      writable: true,
    });
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
const VERSION = packageJson.version;

const program = new Command()
  .name('falcon')
  .version(VERSION)
  .description(
    chalk.magenta('🦅 Falcon') + ' — Launch any coding agent with any LLM in absolute privacy.',
  );

program.configureHelp({
  formatHelp(cmd, helper) {
    const termWidth = helper.padWidth(cmd, helper);
    const helpWidth = helper.helpWidth ?? 80;

    const callFormatItem = (term: string, description: string) => {
      return helper.formatItem(term, termWidth, description, helper);
    };

    // Usage
    let output = [
      `${helper.styleTitle('Usage:')} ${helper.styleUsage(helper.commandUsage(cmd))}`,
      '',
    ];

    // Description
    const commandDescription = helper.commandDescription(cmd);
    if (commandDescription.length > 0) {
      output = output.concat([
        helper.boxWrap(helper.styleCommandDescription(commandDescription), helpWidth),
        '',
      ]);
    }

    // Arguments
    const argumentList = helper.visibleArguments(cmd).map((argument) => {
      return callFormatItem(
        helper.styleArgumentTerm(helper.argumentTerm(argument)),
        helper.styleArgumentDescription(helper.argumentDescription(argument)),
      );
    });
    output = output.concat(helper.formatItemList('Arguments:', argumentList, helper));

    // Commands (moved before Options)
    const commandGroups = helper.groupItems(
      [...cmd.commands],
      helper.visibleCommands(cmd),
      (sub) => sub.helpGroup() || 'Commands:',
    );
    commandGroups.forEach((commands, group) => {
      const commandList = commands.map((sub) => {
        return callFormatItem(
          helper.styleSubcommandTerm(helper.subcommandTerm(sub)),
          helper.styleSubcommandDescription(helper.subcommandDescription(sub)),
        );
      });
      output = output.concat(helper.formatItemList(group, commandList, helper));
    });

    // Options
    const optionGroups = helper.groupItems(
      [...cmd.options],
      helper.visibleOptions(cmd),
      (option) => option.helpGroupHeading ?? 'Options:',
    );
    optionGroups.forEach((options, group) => {
      const optionList = options.map((option) => {
        return callFormatItem(
          helper.styleOptionTerm(helper.optionTerm(option)),
          helper.styleOptionDescription(helper.optionDescription(option)),
        );
      });
      output = output.concat(helper.formatItemList(group, optionList, helper));
    });

    if (helper.showGlobalOptions) {
      const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
        return callFormatItem(
          helper.styleOptionTerm(helper.optionTerm(option)),
          helper.styleOptionDescription(helper.optionDescription(option)),
        );
      });
      output = output.concat(helper.formatItemList('Global Options:', globalOptionList, helper));
    }

    return output.join('\n');
  },
});

async function handleLaunch(
  agentName: string | undefined,
  agentArgs: string[] | undefined,
  options: {
    model?: string;
    gateway?: string;
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
  .argument('[agent]', 'Agent to launch (codex, claude, opencode)')
  .argument('[agentArgs...]', 'Arguments to pass to the agent')
  .option('-m, --model <model>', 'Model to use')
  .option(
    '-g, --gateway <gateway>',
    'API gateway to use (openrouter, openai, anthropic, cloudflare)',
  )
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
    .allowUnknownOption(true)
    .description(`Launch ${agent.name} with a specific model via an API gateway`)
    .action(
      async (
        agentArgs: string[] | undefined,
        options: {
          model?: string;
          gateway?: string;
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
