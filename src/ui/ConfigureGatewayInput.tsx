import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';
import type { Gateway, GatewayInstance } from '../gateways/index.js';
import { withGatewayEnvAsync } from '../gateways/index.js';
import { DEFAULT_OPENAI_BASE_URL, DEFAULT_ANTHROPIC_BASE_URL } from '../constants.js';

interface ConfigField {
  label: string;
  envVar: string;
  defaultValue?: string;
  mask?: boolean;
  optional?: boolean;
}

const CONFIG_FIELDS: Record<string, ConfigField[]> = {
  openrouter: [{ label: 'OpenRouter API Key', envVar: 'OPENROUTER_API_KEY', mask: true }],
  openai: [
    { label: 'OpenAI API Key', envVar: 'OPENAI_API_KEY', mask: true },
    {
      label: 'OpenAI Base URL',
      envVar: 'OPENAI_BASE_URL',
      defaultValue: DEFAULT_OPENAI_BASE_URL,
      optional: true,
    },
  ],
  anthropic: [
    { label: 'Anthropic API Key', envVar: 'ANTHROPIC_API_KEY', mask: true },
    {
      label: 'Anthropic Base URL',
      envVar: 'ANTHROPIC_BASE_URL',
      defaultValue: DEFAULT_ANTHROPIC_BASE_URL,
      optional: true,
    },
  ],
  cloudflare: [
    { label: 'Cloudflare API Key', envVar: 'CLOUDFLARE_API_KEY', mask: true },
    { label: 'Cloudflare Account ID', envVar: 'CLOUDFLARE_ACCOUNT_ID' },
    { label: 'Cloudflare Gateway ID', envVar: 'CLOUDFLARE_GATEWAY_ID', defaultValue: 'default' },
  ],
};

interface ConfigureGatewayInputProps {
  gateway: Gateway;
  editingInstance?: GatewayInstance;
  onConfigured: (config: Record<string, string>) => void;
  onCancel: () => void;
}

export function ConfigureGatewayInput({
  gateway,
  editingInstance,
  onConfigured,
  onCancel,
}: ConfigureGatewayInputProps) {
  const fields = CONFIG_FIELDS[gateway.slug] || [
    {
      label: `${gateway.name} API Key`,
      envVar: `${gateway.slug.toUpperCase()}_API_KEY`,
      mask: true,
    },
  ];

  const [fieldIndex, setFieldIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (editingInstance) {
      return { ...editingInstance.fields };
    }
    return {};
  });

  const [currentVal, setCurrentVal] = useState(() => {
    const currentField = fields[0];
    if (editingInstance && currentField) {
      return editingInstance.fields[currentField.envVar] || currentField.defaultValue || '';
    }
    return currentField?.defaultValue || '';
  });

  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const currentField = fields[fieldIndex];

  const handleSubmit = async (val: string) => {
    if (!currentField || isValidating) {
      return;
    }
    const trimmed = val.trim();
    if (!trimmed && !currentField.optional && !currentField.defaultValue) {
      // Don't allow empty inputs unless they are optional or have a default value
      return;
    }

    const finalVal = trimmed || '';
    const newValues = { ...values, [currentField.envVar]: finalVal };
    setValues(newValues);

    if (fieldIndex < fields.length - 1) {
      const nextIndex = fieldIndex + 1;
      setFieldIndex(nextIndex);
      const nextField = fields[nextIndex];
      const nextVal =
        (editingInstance ? newValues[nextField.envVar] : undefined) ??
        nextField?.defaultValue ??
        '';
      setCurrentVal(nextVal);
    } else {
      // Last field submitted. Let's validate!
      setIsValidating(true);
      setValidationError(null);

      let apiKey = '';
      if (gateway.slug === 'openrouter') {
        apiKey = newValues.OPENROUTER_API_KEY || '';
      } else if (gateway.slug === 'openai') {
        apiKey = newValues.OPENAI_API_KEY || '';
      } else if (gateway.slug === 'anthropic') {
        apiKey = newValues.ANTHROPIC_API_KEY || '';
      } else if (gateway.slug === 'cloudflare') {
        apiKey = newValues.CLOUDFLARE_API_KEY || '';
      }

      try {
        await withGatewayEnvAsync({ fields: newValues }, async () => {
          await gateway.listModels(apiKey);
        });
        setIsValidating(false);
        onConfigured(newValues);
      } catch (err: unknown) {
        setIsValidating(false);
        setValidationError(err instanceof Error ? err.message : String(err));

        // Reset to first field prefilled so they can correct it
        setFieldIndex(0);
        const firstField = fields[0];
        setCurrentVal(newValues[firstField.envVar] || firstField.defaultValue || '');
      }
    }
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">
        {editingInstance ? `Updating ${editingInstance.name}` : `Configuring ${gateway.name}`}
      </Text>

      {/* Show completed fields */}
      {fields.slice(0, fieldIndex).map((f) => {
        const val = values[f.envVar] || '';
        const displayVal = val
          ? f.mask
            ? val.substring(0, 8) + '...' + val.substring(val.length - 4)
            : val
          : '<default>';
        return (
          <Box key={f.envVar} marginTop={0.5} marginLeft={2}>
            <Text color="green">✓ </Text>
            <Text dimColor>{f.label}: </Text>
            <Text color="white">{displayVal}</Text>
          </Box>
        );
      })}

      {/* Show active field input */}
      {!isValidating && currentField && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          <Text bold>
            Enter {currentField.label}: {currentField.optional ? '(optional)' : ''}
          </Text>
          {currentField.defaultValue && <Text dimColor>Default: {currentField.defaultValue}</Text>}
          <Box borderStyle="single" borderColor="cyan" paddingX={1} marginTop={0.5} width={60}>
            <TextInput
              value={currentVal}
              onChange={setCurrentVal}
              onSubmit={handleSubmit}
              showCursor={true}
              placeholder={currentField.defaultValue}
              mask={currentField.mask ? '*' : undefined}
            />
          </Box>
        </Box>
      )}

      {isValidating && (
        <Box marginTop={1} marginLeft={2} flexDirection="column">
          <Text color="yellow" bold>
            ⠋ Validating connection with gateway API...
          </Text>
        </Box>
      )}

      {validationError && (
        <Box marginTop={1} marginLeft={2} flexDirection="column">
          <Text color="red" bold>
            ✖ Validation Error:
          </Text>
          <Text color="red">{validationError}</Text>
        </Box>
      )}

      <Box marginTop={1} marginLeft={2}>
        <Text dimColor>Enter to submit • Esc to cancel</Text>
      </Box>
    </Box>
  );
}
