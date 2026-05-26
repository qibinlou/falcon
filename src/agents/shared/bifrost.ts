import { type ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getFreePort, waitForPort } from '../../utils.js';

export interface BifrostInstance {
  port: number;
  appDir: string;
  proc: ChildProcess;
  cleanup: () => void;
}

export async function startBifrost(
  provider: 'openai' | 'anthropic',
  apiKey: string,
): Promise<BifrostInstance> {
  const bifrostPort = await getFreePort();
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bifrost-app-'));

  const envKey = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';

  const configContent = {
    providers: {
      [provider]: {
        keys: [
          {
            name: 'default',
            value: `env.${envKey}`,
            weight: 1,
            models: ['*'],
          },
        ],
      },
    },
  };

  fs.writeFileSync(path.join(appDir, 'config.json'), JSON.stringify(configContent, null, 2));

  const logFile = fs.openSync(path.join(appDir, 'bifrost.log'), 'a');

  const proc = spawn(
    'npx',
    ['--no-install', 'bifrost', '-port', String(bifrostPort), '-app-dir', appDir],
    {
      env: { ...process.env, [envKey]: apiKey },
      detached: true,
      stdio: ['ignore', logFile, logFile],
    },
  );
  proc.unref();

  const cleanup = () => {
    if (proc) {
      try {
        if (proc.pid) {
          process.kill(-proc.pid, 'SIGTERM');
        } else {
          proc.kill();
        }
      } catch (_) {
        try {
          proc.kill();
        } catch (__) {}
      }
    }
    try {
      fs.rmSync(appDir, { recursive: true, force: true });
    } catch (_) {}
  };

  try {
    await waitForPort(bifrostPort, 15000);
  } catch (err) {
    if (fs.existsSync(path.join(appDir, 'bifrost.log'))) {
      try {
        const logs = fs.readFileSync(path.join(appDir, 'bifrost.log'), 'utf8');
        console.error(`\x1b[33mBifrost Startup Logs:\n${logs}\x1b[0m`);
      } catch (_) {}
    }
    cleanup();
    throw err;
  }

  return {
    port: bifrostPort,
    appDir,
    proc,
    cleanup,
  };
}

export const bifrost = {
  startBifrost,
};
