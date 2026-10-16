/**
 * Entry point for the TypeORM command-line tool only (`npm run db:migrate`,
 * `npm run db:migration:generate`, ...). The CLI needs a module that exports a DataSource.
 * The application itself builds its DataSource in server.ts.
 */
import { createDataSource } from './database.ts';
import { env } from './env.ts';

export default createDataSource(env);
