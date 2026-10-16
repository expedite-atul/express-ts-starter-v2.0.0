/**
 * PostgreSQL access through TypeORM.
 *
 * `createDataSource` only describes the connection; `dataSource.initialize()` (called by
 * server.ts, scripts and tests) opens the connection pool, and `destroy()` closes it.
 */
import { DataSource } from 'typeorm';
import { MIGRATIONS } from '../../migrations/index.ts';
import { ENTITIES } from '../entities/index.ts';

export interface DatabaseConfig {
  DATABASE_URL: string;
  DATABASE_POOL_SIZE: number;
}

export function createDataSource(config: DatabaseConfig): DataSource {
  return new DataSource({
    type: 'postgres',
    url: config.DATABASE_URL,
    applicationName: 'employee-management-api',
    poolSize: config.DATABASE_POOL_SIZE,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    // Never let the ORM change the schema on startup. Every schema change is a reviewed
    // migration file in migrations/, applied with `npm run db:migrate`.
    synchronize: false,
    migrationsRun: false,
    migrationsTransactionMode: 'each',
    // UUID primary keys default to gen_random_uuid(), built into PostgreSQL 13+, so the app
    // needs no CREATE EXTENSION privilege.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    logging: false,
  });
}
