import { Box, Text } from 'ink';
import type { AgentLauncher } from '../agents/index.js';

const FALCON_LOGO = `
  █████▒▄▄▄       ██▓     ▄████▄   ▒█████   ███▄    █ 
▓██   ▒▒████▄    ▓██▒    ▒██▀ ▀█  ▒██▒  ██▒ ██ ▀█   █ 
▒████ ░▒██  ▀█▄  ▒██░    ▒▓█    ▄ ▒██░  ██▒▓██  ▀█ ██▒
░▓█▒  ░░██▄▄▄▄██ ▒██░    ▒▓▓▄ ▄██▒▒██   ██░▓██▒  ▐▌██▒
░▒█░    ▓█   ▓██▒░██████▒▒ ▓███▀ ░░ ████▓▒░▒██░   ▓██░
 ▒ ░    ▒▒   ▓▒█░░ ▒░▓  ░░ ░▒ ▒  ░░ ▒░▒░▒░ ░ ▒░   ▒ ▒ 
 ░       ▒   ▒▒ ░░ ░ ▒  ░  ░  ▒     ░ ▒ ▒░ ░ ░░   ░ ▒░
 ░ ░     ░   ▒     ░ ░   ░        ░ ░ ░ ▒     ░   ░ ░ 
             ░  ░    ░  ░░ ░          ░ ░           ░ 
                         ░                            
`;

interface HeaderProps {
  agent: AgentLauncher;
}

export function Header({ agent }: HeaderProps) {
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text color="cyan" bold>
        {FALCON_LOGO}
      </Text>
      <Box marginLeft={2} flexDirection="column">
        <Text bold color="magenta">
          🦅 MULTI-GATEWAY AGENT RUNNER
        </Text>
        <Box marginTop={1}>
          <Text>
            Active agent:{' '}
            <Text bold color="yellow">
              {agent.name}
            </Text>
            {/* <Text dimColor> • v0.1.0</Text> */}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
