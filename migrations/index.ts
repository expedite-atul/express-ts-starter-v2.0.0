/**
 * Every migration, oldest first. TypeORM runs the ones not yet recorded in the
 * `migrations` table, in this order.
 *
 * After `npm run db:migration:generate -- migrations/<Name>` creates a file, import its
 * class here. Never edit a migration that has already run anywhere: add a new one.
 */
import type { MigrationInterface } from 'typeorm';
import { InitialSchema1792137609421 } from './1792137609421-InitialSchema.ts';

export const MIGRATIONS: (new () => MigrationInterface)[] = [InitialSchema1792137609421];
