import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import type { GatewayInstance } from '../gateways/index.js';

interface GatewayPickerProps {
  instances: GatewayInstance[];
  onAdd: () => void;
  onDelete: (instance: GatewayInstance) => void;
  onUpdate: (instance: GatewayInstance) => void;
  onBack: () => void;
}

export function GatewayPicker({
  instances,
  onAdd,
  onDelete,
  onUpdate,
  onBack,
}: GatewayPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useInput((input, key) => {
    if (input === 'a' || input === 'A') {
      onAdd();
      return;
    }

    if (key.escape) {
      onBack();
      return;
    }

    if (instances.length === 0) {
      return;
    }

    const highlighted = instances[selectedIndex];

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      setMessage(null);
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(instances.length - 1, prev + 1));
      setMessage(null);
    } else if (key.return) {
      onBack();
    } else if (input === 'd' || input === 'D') {
      if (highlighted) {
        if (highlighted.isEnv) {
          setMessage('Cannot delete system environment gateways.');
        } else {
          onDelete(highlighted);
          setSelectedIndex((prev) => Math.max(0, prev - 1));
          setMessage(`Deleted gateway: ${highlighted.name}`);
        }
      }
    } else if (input === 'u' || input === 'U') {
      if (highlighted) {
        if (highlighted.isEnv) {
          setMessage('Cannot update system environment gateways.');
        } else {
          onUpdate(highlighted);
        }
      }
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">
        🦅 Falcon Gateway Manager
      </Text>
      <Text dimColor>Manage your API key configurations and providers.</Text>

      <Box flexDirection="column" marginTop={1}>
        {instances.length === 0 ? (
          <Text color="yellow">No active gateways. Press 'a' to add one.</Text>
        ) : (
          instances.map((inst, i) => {
            const isSelected = i === selectedIndex;
            const maskedKey = inst.apiKey
              ? inst.apiKey.substring(0, 8) + '...' + inst.apiKey.substring(inst.apiKey.length - 4)
              : 'None';

            return (
              <Box key={inst.id}>
                <Text color={isSelected ? 'cyan' : 'white'}>{isSelected ? '❯ ' : '  '}</Text>
                <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                  {inst.name}
                </Text>
                <Text dimColor> ({maskedKey})</Text>
                {inst.isEnv && (
                  <Text color="magenta" bold>
                    {' '}
                    [Env] [read-only]
                  </Text>
                )}
              </Box>
            );
          })
        )}
      </Box>

      {message && (
        <Box marginTop={1}>
          <Text color="yellow" bold>
            {message}
          </Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>↑↓ navigate • a add new gateway • Esc/Enter back</Text>
        {instances.length > 0 && <Text dimColor>d delete selected • u update selected</Text>}
      </Box>
    </Box>
  );
}
