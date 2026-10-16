/**
 * Runs once before all tests: creates the test database if it does not exist and applies
 * every migration, exactly as `npm run db:migrate` would in a real environment.
 */
import pg from 'pg';
import { createDataSource } from '../../src/config/database.ts';
import { assertTestDatabase } from '../helpers/test-app.ts';
import { TEST_DATABASE_URL } from '../helpers/test-config.ts';

export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const databaseName = url.pathname.slice(1);
  assertTestDatabase(databaseName);

  // Connect to the server's maintenance database to create the test database.
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (rowCount === 0) {
      // Identifiers cannot be bound parameters; the name was validated by assertTestDatabase.
      await client.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await client.end();
  }

  const dataSource = createDataSource({ DATABASE_URL: TEST_DATABASE_URL, DATABASE_POOL_SIZE: 2 });
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
