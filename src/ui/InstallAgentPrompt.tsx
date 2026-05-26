import { spawn } from 'child_process';
import fs from 'fs';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useEffect, useState, useRef } from 'react';
import type { AgentLauncher } from '../agents/index.js';
import { setCustomBinPath } from '../config.js';
import { copyToClipboard } from '../utils.js';

interface InstallAgentPromptProps {
  agent: AgentLauncher;
  onConfigured: () => void;
  onCancel: () => void;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function InstallAgentPrompt({ agent, onConfigured, onCancel }: InstallAgentPromptProps) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<
    | 'main'
    | 'confirm-install'
    | 'installing'
    | 'install-success'
    | 'install-fail'
    | 'input-path'
    | 'copied'
  >('main');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  const options = [
    `Install globally for me\n       (Runs: ${agent.installCommand})`,
    'Specify path to my local CLI binary',
    'Copy install command to clipboard and exit',
  ];

  const handleSelect = (index: number) => {
    if (index === 0) {
      setPhase('confirm-install');
    } else if (index === 1) {
      setPhase('input-path');
    } else if (index === 2) {
      const success = copyToClipboard(agent.installCommand);
      setCopiedSuccess(success);
      setPhase('copied');
    }
  };

  useInput((_input, key) => {
    if (phase !== 'main') return;

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      handleSelect(selectedIndex);
    } else if (_input === '1') {
      handleSelect(0);
    } else if (_input === '2') {
      handleSelect(1);
    } else if (_input === '3') {
      handleSelect(2);
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="yellow">
        ⚠️ {agent.name} CLI binary is not installed or discovered in your system path!
      </Text>

      {phase === 'main' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Choose an option to install or configure it:</Text>
          <Box flexDirection="column" marginTop={1} marginLeft={2}>
            {options.map((opt, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <Box key={opt} marginTop={idx > 0 ? 0.5 : 0}>
                  <Text color={isSelected ? 'cyan' : 'white'}>{isSelected ? '❯ ' : '  '}</Text>
                  <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                    {idx + 1}. {opt}
                  </Text>
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1} marginLeft={2}>
            <Text dimColor>↑↓ navigate • Enter to select • Esc to cancel</Text>
          </Box>
        </Box>
      )}

      {phase === 'confirm-install' && (
        <ConfirmInstallView
          command={agent.installCommand}
          onConfirm={() => setPhase('installing')}
          onCancel={() => setPhase('main')}
        />
      )}

      {phase === 'installing' && (
        <InstallingView
          command={agent.installCommand}
          onComplete={() => setPhase('install-success')}
          onError={(err) => {
            setErrorMsg(err);
            setPhase('install-fail');
          }}
        />
      )}

      {phase === 'install-success' && (
        <InstallSuccessView
          onContinue={() => {
            onConfigured();
          }}
        />
      )}

      {phase === 'install-fail' && (
        <InstallFailView error={errorMsg} onRetry={() => setPhase('main')} onCancel={onCancel} />
      )}

      {phase === 'input-path' && (
        <InputPathView
          agent={agent}
          onSubmit={(path) => {
            setCustomBinPath(agent.slug, path);
            onConfigured();
          }}
          onCancel={() => setPhase('main')}
        />
      )}

      {phase === 'copied' && (
        <CopiedView
          command={agent.installCommand}
          success={copiedSuccess}
          onExit={() => {
            exit();
          }}
        />
      )}
    </Box>
  );
}

interface ConfirmInstallViewProps {
  command: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmInstallView({ command, onConfirm, onCancel }: ConfirmInstallViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow || key.downArrow) {
      setSelectedIndex((prev) => (prev === 0 ? 1 : 0));
    } else if (key.return) {
      if (selectedIndex === 0) {
        onConfirm();
      } else {
        onCancel();
      }
    } else if (_input === '1' || _input === 'y' || _input === 'Y') {
      onConfirm();
    } else if (_input === '2' || _input === 'n' || _input === 'N') {
      onCancel();
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      <Text bold color="yellow">
        Configure Global Installation
      </Text>
      <Text>This will run the following command to install the CLI globally:</Text>
      <Box marginTop={0.5}>
        <Text color="cyan" bold>
          {' '}
          {command}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color={selectedIndex === 0 ? 'cyan' : 'white'}>
            {selectedIndex === 0 ? '❯ ' : '  '}Yes, install now
          </Text>
        </Box>
        <Box>
          <Text color={selectedIndex === 1 ? 'cyan' : 'white'}>
            {selectedIndex === 1 ? '❯ ' : '  '}No, go back
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate • Enter to select • Esc to cancel</Text>
      </Box>
    </Box>
  );
}

interface InstallingViewProps {
  command: string;
  onComplete: () => void;
  onError: (err: string) => void;
}

function InstallingView({ command, onComplete, onError }: InstallingViewProps) {
  const [logLines, setLogLines] = useState<{ id: string; text: string }[]>([]);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const lineIdCounter = useRef(0);

  useEffect(() => {
    const spinnerInterval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);

    const child = spawn(command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const handleData = (data: Buffer) => {
      const text = data.toString();
      const lines = text.split('\n').filter(Boolean);
      setLogLines((prev) => {
        const mapped = lines.map((line) => {
          lineIdCounter.current += 1;
          return {
            id: `line-${lineIdCounter.current}`,
            text: line,
          };
        });
        const next = [...prev, ...mapped];
        if (next.length > 8) {
          return next.slice(next.length - 8);
        }
        return next;
      });
    };

    child.stdout?.on('data', handleData);
    child.stderr?.on('data', handleData);

    child.on('close', (code) => {
      clearInterval(spinnerInterval);
      if (code === 0) {
        onComplete();
      } else {
        onError(`Global install failed with exit code ${code}.`);
      }
    });

    return () => {
      clearInterval(spinnerInterval);
      child.kill();
    };
  }, [command, onComplete, onError]);

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      <Box flexDirection="row">
        <Text color="cyan">{SPINNER_FRAMES[spinnerFrame]} </Text>
        <Text bold>Installing agent globally...</Text>
      </Box>
      <Box marginTop={0.5}>
        <Text dimColor>Running: {command}</Text>
      </Box>

      <Box
        borderStyle="single"
        borderColor="gray"
        flexDirection="column"
        paddingX={1}
        marginTop={0.5}
        width={70}
      >
        {logLines.length === 0 ? (
          <Text dimColor>Waiting for installation output...</Text>
        ) : (
          logLines.map((line) => (
            <Text key={line.id} wrap="truncate-end">
              {line.text}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

interface InstallSuccessViewProps {
  onContinue: () => void;
}

function InstallSuccessView({ onContinue }: InstallSuccessViewProps) {
  useInput((_input, key) => {
    if (key.return) {
      onContinue();
    }
  });

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      <Text color="green" bold>
        ✓ Global installation completed successfully!
      </Text>
      <Box marginTop={0.5}>
        <Text>The agent CLI binary is now available in your system path.</Text>
      </Box>

      <Box marginTop={1}>
        <Text bold color="cyan">
          Press Enter to continue launching...
        </Text>
      </Box>
    </Box>
  );
}

interface InstallFailViewProps {
  error: string;
  onRetry: () => void;
  onCancel: () => void;
}

function InstallFailView({ error, onRetry, onCancel }: InstallFailViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow || key.downArrow) {
      setSelectedIndex((prev) => (prev === 0 ? 1 : 0));
    } else if (key.return) {
      if (selectedIndex === 0) {
        onRetry();
      } else {
        onCancel();
      }
    } else if (_input === '1') {
      onRetry();
    } else if (_input === '2') {
      onCancel();
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      <Text color="red" bold>
        ✖ Global installation failed
      </Text>
      <Box marginTop={0.5}>
        <Text color="red">{error}</Text>
      </Box>
      <Box marginTop={0.5}>
        <Text dimColor>
          Hint: Try installing it manually using your package manager, or ensure you have the
          required write permissions for global npm packages.
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color={selectedIndex === 0 ? 'cyan' : 'white'}>
            {selectedIndex === 0 ? '❯ ' : '  '}Go back to options
          </Text>
        </Box>
        <Box>
          <Text color={selectedIndex === 1 ? 'cyan' : 'white'}>
            {selectedIndex === 1 ? '❯ ' : '  '}Exit Falcon
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate • Enter to select • Esc to exit</Text>
      </Box>
    </Box>
  );
}

interface InputPathViewProps {
  agent: AgentLauncher;
  onSubmit: (path: string) => void;
  onCancel: () => void;
}

function InputPathView({ agent, onSubmit, onCancel }: InputPathViewProps) {
  const [pathInput, setPathInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  const handleSubmit = () => {
    const trimmed = pathInput.trim();
    if (!trimmed) return;

    try {
      const stats = fs.statSync(trimmed);
      if (!stats.isFile()) {
        setError('Path must be a file, not a directory.');
        return;
      }
      fs.accessSync(trimmed, fs.constants.X_OK);
      onSubmit(trimmed);
    } catch {
      setError('File does not exist or is not executable.');
    }
  };

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      <Text bold>Specify Local {agent.name} CLI Binary Path</Text>
      <Text dimColor>Please paste/enter the absolute path to the local binary:</Text>

      <Box borderStyle="single" borderColor="cyan" paddingX={1} marginTop={0.5} width={60}>
        <TextInput
          value={pathInput}
          onChange={setPathInput}
          onSubmit={handleSubmit}
          showCursor={true}
          placeholder="/path/to/binary"
        />
      </Box>

      {error && (
        <Box marginTop={0.5}>
          <Text color="red">✖ {error}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter to submit • Esc to cancel</Text>
      </Box>
    </Box>
  );
}

interface CopiedViewProps {
  command: string;
  success: boolean;
  onExit: () => void;
}

function CopiedView({ command, success, onExit }: CopiedViewProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onExit();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onExit]);

  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2}>
      {success ? (
        <Text color="green" bold>
          ✓ Copied install command to clipboard!
        </Text>
      ) : (
        <Text color="yellow" bold>
          ⚠️ Failed to copy automatically. Please copy the command below:
        </Text>
      )}
      <Box marginTop={0.5}>
        <Text color="cyan" bold>
          {' '}
          {command}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>Please run this command manually in a new terminal window.</Text>
      </Box>
      <Box marginTop={0.5}>
        <Text dimColor>Falcon will exit now...</Text>
      </Box>
    </Box>
  );
}
