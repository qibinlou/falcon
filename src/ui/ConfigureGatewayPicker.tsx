import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import type { Gateway } from '../gateways/index.js';
import { ALL_GATEWAYS } from '../gateways/index.js';

interface ConfigureGatewayPickerProps {
  onSelect: (selected: Gateway) => void;
  onCancel: () => void;
  title?: string;
}

export function ConfigureGatewayPicker({ onSelect, onCancel, title }: ConfigureGatewayPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(ALL_GATEWAYS.length - 1, prev + 1));
    } else if (key.return) {
      const selected = ALL_GATEWAYS[selectedIndex];
      if (selected) {
        onSelect(selected);
      }
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="yellow" bold>
        {title || 'No API keys detected. Select a provider to configure:'}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {ALL_GATEWAYS.map((gw, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={gw.slug}>
              <Text color={isSelected ? 'cyan' : 'white'}>{isSelected ? '❯ ' : '  '}</Text>
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                {gw.name}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate • Enter select • Esc exit</Text>
      </Box>
    </Box>
  );
}
