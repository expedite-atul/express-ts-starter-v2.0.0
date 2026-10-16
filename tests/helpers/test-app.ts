/**
 * Builds the real application against the test database, with an in-memory log so tests
 * can inspect what was logged.
 */
import type { Express } from 'express';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApp } from '../../src/app.ts';
import { createDataSource } from '../../src/config/database.ts';
import type { Env } from '../../src/config/env.ts';
import { createLogger } from '../../src/config/logger.ts';
import { createServices, type Services } from '../../src/container.ts';
import { PasswordHasher } from '../../src/services/password-hasher.ts';
import { DEV_PASSWORD, seedDevelopmentData, type SeededIds } from '../../seeds/development-data.ts';
import { seedReferenceData } from '../../seeds/reference-data.ts';
import { testConfig } from './test-config.ts';

export interface TestContext {
  app: Express;
  config: Env;
  dataSource: DataSource;
  services: Services;
  /** Every log line written so far (JSON strings). */
  logs: string[];
  /** IDs of the seeded departments, employees and users, refreshed by `reset()`. */
  ids: SeededIds;
  /** Empties every table and re-seeds the fictional development data. */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/** Refuse to wipe a database unless its name says it is for tests. */
export function assertTestDatabase(name: string): void {
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`Refusing to use database "${name}" for tests: its name must end with "_test".`);
  }
}

let devPasswordHash: Promise<string> | undefined;

export async function createTestContext(overrides: Record<string, string> = {}): Promise<TestContext> {
  const config = testConfig(overrides);
  assertTestDatabase(new URL(config.DATABASE_URL).pathname.slice(1));

  const dataSource = createDataSource(config);
  await dataSource.initialize();

  const logs: string[] = [];
  const logger = createLogger({ level: 'debug', destination: { write: (line: string) => void logs.push(line) } });
  const services = createServices(dataSource, config);
  const app = createApp({ config, logger, services });

  const context: TestContext = {
    app,
    config,
    dataSource,
    services,
    logs,
    ids: undefined as unknown as SeededIds,
    reset: async () => {
      devPasswordHash ??= new PasswordHasher().hash(DEV_PASSWORD);
      const passwordHash = await devPasswordHash;
      const tables = dataSource.entityMetadatas.map((meta) => `"${meta.tableName}"`).join(', ');
      context.ids = await dataSource.transaction(async (manager) => {
        await manager.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
        await seedReferenceData(manager);
        return seedDevelopmentData(manager, passwordHash);
      });
      logs.length = 0;
    },
    close: () => dataSource.destroy(),
  };
  return context;
}

export interface LoginResult {
  accessToken: string;
  /** `refresh_token=<value>`, ready for a Cookie header. */
  refreshCookie: string;
  body: Record<string, unknown>;
}

export async function login(app: Express, email: string, password = DEV_PASSWORD): Promise<LoginResult> {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`Login as ${email} failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  const body = response.body as Record<string, unknown>;
  return { accessToken: body.accessToken as string, refreshCookie: refreshCookieFrom(response), body };
}

export function refreshCookieFrom(response: request.Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('refresh_token='))?.split(';')[0];
  if (!cookie) throw new Error('No refresh_token cookie in the response');
  return cookie;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
