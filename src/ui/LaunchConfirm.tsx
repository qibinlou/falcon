import { Box, Text, useInput } from 'ink';
import type { AgentLauncher } from '../agents/index.js';
import type { ModelInfo } from '../gateways/index.js';

interface LaunchConfirmProps {
  agent: AgentLauncher;
  gateway: { name: string; slug: string };
  model: ModelInfo;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LaunchConfirm({ agent, gateway, model, onConfirm, onCancel }: LaunchConfirmProps) {
  useInput((_input, key) => {
    if (key.return) {
      onConfirm();
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        <Text color="green">✓</Text> Connected to{' '}
        <Text bold color="cyan">
          {gateway.name}
        </Text>
      </Text>

      <Box
        marginTop={1}
        flexDirection="column"
        borderStyle="round"
        borderColor="magenta"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="white">
          Launch Configuration
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Box width={14}>
              <Text dimColor>Agent:</Text>
            </Box>
            <Text bold color="green">
              {agent.name}
            </Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text dimColor>Gateway:</Text>
            </Box>
            <Text bold color="cyan">
              {gateway.name}
            </Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text dimColor>Model:</Text>
            </Box>
            <Text bold color="yellow">
              {model.name}
            </Text>
          </Box>
          <Box>
            <Box width={14}>
              <Text dimColor>Model ID:</Text>
            </Box>
            <Text color="gray">{model.id}</Text>
          </Box>
          {model.contextLength && (
            <Box>
              <Box width={14}>
                <Text dimColor>Context:</Text>
              </Box>
              <Text>{formatContextLength(model.contextLength)}</Text>
            </Box>
          )}
          {model.pricing && (
            <Box>
              <Box width={14}>
                <Text dimColor>Pricing:</Text>
              </Box>
              <Text color="green">
                {model.pricing.prompt} in / {model.pricing.completion} out
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text>
          <Text color="green" bold>
            Enter
          </Text>{' '}
          to launch •{' '}
          <Text color="yellow" bold>
            Esc
          </Text>{' '}
          to go back
        </Text>
      </Box>
    </Box>
  );
}

function formatContextLength(len: number): string {
  if (len >= 1000000) return `${(len / 1000000).toFixed(1)}M tokens`;
  if (len >= 1000) return `${(len / 1000).toFixed(0)}k tokens`;
  return `${len} tokens`;
}
