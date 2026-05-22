import { Box, Text } from 'ink';
import type { AgentLauncher } from '../agents/index.js';

const FALCON_LOGO = `
  ╭─────────────────────────────────╮
  │  🦅  F A L C O N               │
  │     Multi-Gateway Agent Runner  │
  ╰─────────────────────────────────╯`;

interface HeaderProps {
  agent: AgentLauncher;
}

export function Header({ agent }: HeaderProps) {
  return (
    <Box flexDirection="column">
      <Text color="magenta" bold>
        {FALCON_LOGO}
      </Text>
      <Box marginTop={1} marginLeft={2}>
        <Text>
          Agent:{' '}
          <Text bold color="green">
            {agent.name}
          </Text>
          <Text dimColor> • v0.1.0</Text>
        </Text>
      </Box>
    </Box>
  );
}
