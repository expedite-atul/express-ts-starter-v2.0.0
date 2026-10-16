/**
 * Starts the real server as a separate process with broken configuration and checks that
 * it refuses to start, says why, and does not print secrets.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../helpers/test-config.ts';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const tsx = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));

function environment(overrides: Record<string, string | undefined>): Record<string, string> {
  const config = testConfig();
  const values: Record<string, string | undefined> = {
    ...Object.fromEntries(
      Object.entries(config).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : String(value)]),
    ),
    ...overrides,
  };
  return {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    DOTENV_PATH: '/nonexistent/.env', // make sure a developer's .env file cannot fill the gaps
    ...(Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Record<string, string>),
  };
}

function startServer(env: Record<string, string>): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(tsx, ['src/server.ts'], { cwd: projectRoot, env });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Server did not exit. Output:\n${output}`));
    }, 20_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

describe('startup failures are handled safely', () => {
  it('refuses to start when a required variable is missing', async () => {
    const env = environment({ DATABASE_URL: undefined });
    const { code, output } = await startServer(env);

    expect(code).toBe(1);
    expect(output).toContain('DATABASE_URL is required');
    expect(output).not.toContain(env.JWT_ACCESS_SECRET);
    expect(output).not.toMatch(/at .*\.ts:\d+/); // a clear message, not a stack trace
  });

  it('exits with a clear message when the database is unreachable, without leaking the password', async () => {
    const { code, output } = await startServer(
      environment({ DATABASE_URL: 'postgresql://app:super-secret-db-password@127.0.0.1:1/nowhere' }),
    );

    expect(code).toBe(1);
    expect(output).toContain('Could not connect to the database');
    expect(output).not.toContain('super-secret-db-password');
  });
});
